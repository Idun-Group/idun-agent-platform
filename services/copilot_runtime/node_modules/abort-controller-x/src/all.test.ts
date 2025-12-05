import defer from 'defer-promise';
import expect from 'expect';
import {AbortError} from './AbortError';
import {all} from './all';
import {createSpy, spyOn} from './testUtils/spy';
import {nextTick} from './utils/nextTick';

it('external abort', async () => {
  const abortController = new AbortController();
  const signal = abortController.signal;
  const addEventListenerSpy = spyOn(signal, 'addEventListener');
  const removeEventListenerSpy = spyOn(signal, 'removeEventListener');

  const deferred1 = defer<string>();
  const deferred2 = defer<number>();

  let result: PromiseSettledResult<[string, number]> | undefined;
  let innerSignal: AbortSignal;

  all(signal, signal => {
    innerSignal = signal;
    return [deferred1.promise, deferred2.promise];
  }).then(
    value => {
      result = {status: 'fulfilled', value};
    },
    reason => {
      result = {status: 'rejected', reason};
    },
  );

  abortController.abort();

  expect(innerSignal!.aborted).toBe(true);

  await nextTick();

  expect(result).toBeUndefined();

  deferred1.reject(new AbortError());
  await nextTick();

  expect(result).toBeUndefined();

  deferred2.reject(new AbortError());
  await nextTick();

  expect(result).toMatchObject({
    status: 'rejected',
    reason: {name: 'AbortError'},
  });

  expect(addEventListenerSpy.callCount).toBe(1);
  expect(removeEventListenerSpy.callCount).toBe(1);
});

it('fulfill', async () => {
  const abortController = new AbortController();
  const signal = abortController.signal;
  const addEventListenerSpy = spyOn(signal, 'addEventListener');
  const removeEventListenerSpy = spyOn(signal, 'removeEventListener');

  const deferred1 = defer<string>();
  const deferred2 = defer<number>();

  let result: PromiseSettledResult<[string, number]> | undefined;
  let innerSignal: AbortSignal;

  all(signal, signal => {
    innerSignal = signal;
    return [deferred1.promise, deferred2.promise];
  }).then(
    value => {
      result = {status: 'fulfilled', value};
    },
    reason => {
      result = {status: 'rejected', reason};
    },
  );

  await nextTick();

  expect(result).toBeUndefined();

  // resolve `deferred2` first to test ordering
  deferred2.resolve(42);
  await nextTick();

  expect(result).toBeUndefined();

  deferred1.resolve('test');
  await nextTick();

  expect(innerSignal!.aborted).toBe(false);
  expect(result).toMatchObject({
    status: 'fulfilled',
    value: ['test', 42],
  });

  expect(addEventListenerSpy.callCount).toBe(1);
  expect(removeEventListenerSpy.callCount).toBe(1);
});

it('reject', async () => {
  const abortController = new AbortController();
  const signal = abortController.signal;
  const addEventListenerSpy = spyOn(signal, 'addEventListener');
  const removeEventListenerSpy = spyOn(signal, 'removeEventListener');

  const deferred1 = defer<string>();
  const deferred2 = defer<number>();

  let result: PromiseSettledResult<[string, number]> | undefined;
  let innerSignal: AbortSignal;

  all(signal, signal => {
    innerSignal = signal;
    return [deferred1.promise, deferred2.promise];
  }).then(
    value => {
      result = {status: 'fulfilled', value};
    },
    reason => {
      result = {status: 'rejected', reason};
    },
  );

  await nextTick();

  expect(result).toBeUndefined();
  expect(innerSignal!.aborted).toBe(false);

  deferred1.reject('test');
  await nextTick();

  expect(result).toBeUndefined();
  expect(innerSignal!.aborted).toBe(true);

  deferred2.reject(new AbortError());
  await nextTick();

  expect(result).toMatchObject({
    status: 'rejected',
    reason: 'test',
  });

  expect(addEventListenerSpy.callCount).toBe(1);
  expect(removeEventListenerSpy.callCount).toBe(1);
});

it('reject during cleanup', async () => {
  const abortController = new AbortController();
  const signal = abortController.signal;
  const addEventListenerSpy = spyOn(signal, 'addEventListener');
  const removeEventListenerSpy = spyOn(signal, 'removeEventListener');

  const deferred1 = defer<string>();
  const deferred2 = defer<number>();

  let result: PromiseSettledResult<[string, number]> | undefined;
  let innerSignal: AbortSignal;

  all(signal, signal => {
    innerSignal = signal;
    return [deferred1.promise, deferred2.promise];
  }).then(
    value => {
      result = {status: 'fulfilled', value};
    },
    reason => {
      result = {status: 'rejected', reason};
    },
  );

  abortController.abort();

  expect(innerSignal!.aborted).toBe(true);

  await nextTick();

  expect(result).toBeUndefined();

  deferred1.reject(new AbortError());
  await nextTick();

  expect(result).toBeUndefined();

  deferred2.reject(new Error('test'));
  await nextTick();

  expect(result).toMatchObject({
    status: 'rejected',
    reason: {message: 'test'},
  });

  expect(addEventListenerSpy.callCount).toBe(1);
  expect(removeEventListenerSpy.callCount).toBe(1);
});

it('empty', async () => {
  const abortController = new AbortController();
  const signal = abortController.signal;
  const addEventListenerSpy = spyOn(signal, 'addEventListener');
  const removeEventListenerSpy = spyOn(signal, 'removeEventListener');

  await expect(all(signal, signal => [])).resolves.toEqual([]);

  expect(addEventListenerSpy.callCount).toBe(0);
  expect(removeEventListenerSpy.callCount).toBe(0);
});

it('abort with custom reason', async () => {
  const abortController = new AbortController();
  const signal = abortController.signal;

  const customReason = new Error('Custom abort reason');

  const deferred1 = defer<string>();
  const deferred2 = defer<number>();

  let innerSignal: AbortSignal;

  const promise = all(signal, signal => {
    innerSignal = signal;
    return [deferred1.promise, deferred2.promise];
  });

  abortController.abort(customReason);

  expect(innerSignal!.aborted).toBe(true);

  // When external signal is aborted with custom reason,
  // promises should reject with AbortError
  deferred1.reject(new AbortError());
  deferred2.reject(new AbortError());

  // The result should be AbortError (first rejection), not custom reason
  await expect(promise).rejects.toMatchObject({
    name: 'AbortError',
  });
});

it('abort before all with custom reason', async () => {
  const abortController = new AbortController();
  const signal = abortController.signal;

  const customReason = new Error('Custom abort reason');
  abortController.abort(customReason);

  const executor = createSpy((signal: AbortSignal) => [Promise.resolve('test')]);

  await expect(all(signal, executor)).rejects.toBe(customReason);

  expect(executor.callCount).toBe(0);
});

it('innerSignal receives custom reason on external abort', async () => {
  const abortController = new AbortController();
  const signal = abortController.signal;

  const customReason = new Error('Custom abort reason');

  const deferred1 = defer<string>();

  let innerSignal: AbortSignal;

  all(signal, signal => {
    innerSignal = signal;
    return [deferred1.promise];
  });

  abortController.abort(customReason);

  expect(innerSignal!.aborted).toBe(true);
  expect(innerSignal!.reason).toBe(customReason);
});

it('innerSignal receives descriptive reason on promise rejection', async () => {
  const abortController = new AbortController();
  const signal = abortController.signal;

  const deferred1 = defer<string>();
  const deferred2 = defer<number>();

  let innerSignal: AbortSignal;

  all(signal, signal => {
    innerSignal = signal;
    return [deferred1.promise, deferred2.promise];
  });

  deferred1.reject(new Error('test'));

  await nextTick();

  expect(innerSignal!.aborted).toBe(true);
  expect(innerSignal!.reason).toMatchObject({
    name: 'AbortError',
    message: 'One of the promises passed to all() rejected',
  });
});
