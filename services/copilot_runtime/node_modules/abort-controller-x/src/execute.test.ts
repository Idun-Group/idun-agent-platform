import defer from 'defer-promise';
import expect from 'expect';
import {execute} from './execute';
import {createSpy, spyOn} from './testUtils/spy';
import {nextTick} from './utils/nextTick';

it('resolve immediately', async () => {
  const abortController = new AbortController();
  const signal = abortController.signal;
  const addEventListenerSpy = spyOn(signal, 'addEventListener');
  const removeEventListenerSpy = spyOn(signal, 'removeEventListener');

  const callback = createSpy(() => {});

  await expect(
    execute<string>(signal, (resolve, reject) => {
      resolve('test');

      return callback;
    }),
  ).resolves.toEqual('test');

  expect(callback.callCount).toBe(0);

  abortController.abort();

  await nextTick();

  expect(callback.callCount).toBe(0);

  expect(addEventListenerSpy.callCount).toBe(0);
  expect(removeEventListenerSpy.callCount).toBe(0);
});

it('resolve before abort', async () => {
  const abortController = new AbortController();
  const signal = abortController.signal;
  const addEventListenerSpy = spyOn(signal, 'addEventListener');
  const removeEventListenerSpy = spyOn(signal, 'removeEventListener');

  let resolve: (value: string) => void;

  const callback = createSpy(() => {});

  let result: PromiseSettledResult<string> | undefined;

  execute<string>(signal, (resolve_, reject) => {
    resolve = resolve_;

    return callback;
  }).then(
    value => {
      result = {status: 'fulfilled', value};
    },
    reason => {
      result = {status: 'rejected', reason};
    },
  );

  resolve!('test');

  abortController.abort();

  await nextTick();

  expect(callback.callCount).toBe(0);
  expect(result).toEqual({status: 'fulfilled', value: 'test'});

  expect(addEventListenerSpy.callCount).toBe(1);
  expect(removeEventListenerSpy.callCount).toBe(1);
});

it('abort before resolve', async () => {
  const abortController = new AbortController();
  const signal = abortController.signal;
  const addEventListenerSpy = spyOn(signal, 'addEventListener');
  const removeEventListenerSpy = spyOn(signal, 'removeEventListener');

  let resolve: (value: string) => void;

  const callback = createSpy(() => {});

  let result: PromiseSettledResult<string> | undefined;

  execute<string>(signal, (resolve_, reject) => {
    resolve = resolve_;

    return callback;
  }).then(
    value => {
      result = {status: 'fulfilled', value};
    },
    reason => {
      result = {status: 'rejected', reason};
    },
  );

  abortController.abort();
  resolve!('test');

  await nextTick();

  expect(callback.callCount).toBe(1);
  expect(result).toMatchObject({
    status: 'rejected',
    reason: {name: 'AbortError'},
  });

  expect(addEventListenerSpy.callCount).toBe(1);
  expect(removeEventListenerSpy.callCount).toBe(1);
});

it('abort before execute', async () => {
  const abortController = new AbortController();
  const signal = abortController.signal;
  const addEventListenerSpy = spyOn(signal, 'addEventListener');
  const removeEventListenerSpy = spyOn(signal, 'removeEventListener');
  abortController.abort();

  const executor = createSpy(
    (
      resolve: (value: string) => void,
      reject: (reason?: any) => void,
    ): (() => void | PromiseLike<void>) => {
      return () => {};
    },
  );

  await expect(execute(signal, executor)).rejects.toMatchObject({
    name: 'AbortError',
  });

  expect(executor.callCount).toBe(0);

  expect(addEventListenerSpy.callCount).toBe(0);
  expect(removeEventListenerSpy.callCount).toBe(0);
});

it('reject immediately', async () => {
  const abortController = new AbortController();
  const signal = abortController.signal;
  const addEventListenerSpy = spyOn(signal, 'addEventListener');
  const removeEventListenerSpy = spyOn(signal, 'removeEventListener');

  const callback = createSpy(() => {});

  await expect(
    execute<string>(signal, (resolve, reject) => {
      reject('test');

      return callback;
    }),
  ).rejects.toEqual('test');

  expect(callback.callCount).toBe(0);

  abortController.abort();

  await nextTick();

  expect(callback.callCount).toBe(0);

  expect(addEventListenerSpy.callCount).toBe(0);
  expect(removeEventListenerSpy.callCount).toBe(0);
});

it('reject before abort', async () => {
  const abortController = new AbortController();
  const signal = abortController.signal;
  const addEventListenerSpy = spyOn(signal, 'addEventListener');
  const removeEventListenerSpy = spyOn(signal, 'removeEventListener');

  let reject: (value: string) => void;

  const callback = createSpy(() => {});

  let result: PromiseSettledResult<string> | undefined;

  execute<string>(signal, (resolve, reject_) => {
    reject = reject_;

    return callback;
  }).then(
    value => {
      result = {status: 'fulfilled', value};
    },
    reason => {
      result = {status: 'rejected', reason};
    },
  );

  reject!('test');

  abortController.abort();

  await nextTick();

  expect(callback.callCount).toBe(0);
  expect(result).toEqual({status: 'rejected', reason: 'test'});

  expect(addEventListenerSpy.callCount).toBe(1);
  expect(removeEventListenerSpy.callCount).toBe(1);
});

it('abort before reject', async () => {
  const abortController = new AbortController();
  const signal = abortController.signal;
  const addEventListenerSpy = spyOn(signal, 'addEventListener');
  const removeEventListenerSpy = spyOn(signal, 'removeEventListener');

  let reject: (value: string) => void;

  const callback = createSpy(() => {});

  let result: PromiseSettledResult<string> | undefined;

  execute<string>(signal, (resolve, reject_) => {
    reject = reject_;

    return callback;
  }).then(
    value => {
      result = {status: 'fulfilled', value};
    },
    reason => {
      result = {status: 'rejected', reason};
    },
  );

  abortController.abort();
  reject!('test');

  await nextTick();

  expect(callback.callCount).toBe(1);
  expect(result).toMatchObject({
    status: 'rejected',
    reason: {name: 'AbortError'},
  });

  expect(addEventListenerSpy.callCount).toBe(1);
  expect(removeEventListenerSpy.callCount).toBe(1);
});

it('async abort callback', async () => {
  const abortController = new AbortController();
  const signal = abortController.signal;
  const addEventListenerSpy = spyOn(signal, 'addEventListener');
  const removeEventListenerSpy = spyOn(signal, 'removeEventListener');

  const callbackDeferred = defer<void>();

  const callback = createSpy(() => callbackDeferred.promise);

  let result: PromiseSettledResult<string> | undefined;

  execute<string>(signal, (resolve, reject) => {
    return callback;
  }).then(
    value => {
      result = {status: 'fulfilled', value};
    },
    reason => {
      result = {status: 'rejected', reason};
    },
  );

  abortController.abort();

  await nextTick();

  expect(result).toBeUndefined();

  callbackDeferred.resolve();

  await nextTick();

  expect(result).toMatchObject({
    status: 'rejected',
    reason: {name: 'AbortError'},
  });
  expect(callback.callCount).toBe(1);

  expect(addEventListenerSpy.callCount).toBe(1);
  expect(removeEventListenerSpy.callCount).toBe(1);
});

it('async abort callback rejection', async () => {
  const abortController = new AbortController();
  const signal = abortController.signal;
  const addEventListenerSpy = spyOn(signal, 'addEventListener');
  const removeEventListenerSpy = spyOn(signal, 'removeEventListener');

  const callback = createSpy(() => Promise.reject('test'));

  let result: PromiseSettledResult<string> | undefined;

  execute<string>(signal, (resolve, reject) => {
    return callback;
  }).then(
    value => {
      result = {status: 'fulfilled', value};
    },
    reason => {
      result = {status: 'rejected', reason};
    },
  );

  abortController.abort();

  await nextTick();

  expect(result).toMatchObject({
    status: 'rejected',
    reason: 'test',
  });
  expect(callback.callCount).toBe(1);

  expect(addEventListenerSpy.callCount).toBe(1);
  expect(removeEventListenerSpy.callCount).toBe(1);
});

it('abort with custom reason', async () => {
  const abortController = new AbortController();
  const signal = abortController.signal;

  const customReason = new Error('Custom abort reason');
  const callback = createSpy((reason?: unknown) => {
    expect(reason).toBe(customReason);
  });

  let result: PromiseSettledResult<string> | undefined;

  execute<string>(signal, (resolve, reject) => {
    return callback;
  }).then(
    value => {
      result = {status: 'fulfilled', value};
    },
    reason => {
      result = {status: 'rejected', reason};
    },
  );

  abortController.abort(customReason);

  await nextTick();

  expect(callback.callCount).toBe(1);
  expect(result).toMatchObject({
    status: 'rejected',
    reason: customReason,
  });
});

it('abort before execute with custom reason', async () => {
  const abortController = new AbortController();
  const signal = abortController.signal;

  const customReason = new Error('Custom abort reason');
  abortController.abort(customReason);

  const executor = createSpy(
    (
      resolve: (value: string) => void,
      reject: (reason?: any) => void,
    ): (() => void | PromiseLike<void>) => {
      return () => {};
    },
  );

  await expect(execute(signal, executor)).rejects.toBe(customReason);

  expect(executor.callCount).toBe(0);
});

it('async abort callback with custom reason', async () => {
  const abortController = new AbortController();
  const signal = abortController.signal;

  const customReason = new Error('Custom abort reason');
  const callbackDeferred = defer<void>();

  const callback = createSpy((reason?: unknown) => {
    expect(reason).toBe(customReason);
    return callbackDeferred.promise;
  });

  let result: PromiseSettledResult<string> | undefined;

  execute<string>(signal, (resolve, reject) => {
    return callback;
  }).then(
    value => {
      result = {status: 'fulfilled', value};
    },
    reason => {
      result = {status: 'rejected', reason};
    },
  );

  abortController.abort(customReason);

  await nextTick();

  expect(result).toBeUndefined();

  callbackDeferred.resolve();

  await nextTick();

  expect(result).toMatchObject({
    status: 'rejected',
    reason: customReason,
  });
  expect(callback.callCount).toBe(1);
});
