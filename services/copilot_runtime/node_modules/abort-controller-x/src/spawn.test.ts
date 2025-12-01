import expect from 'expect';
import {spawn} from './spawn';
import {createSpy, spyOn} from './testUtils/spy';
import {forever} from './forever';
import {delay} from './delay';

it('fork manual abort', async () => {
  const abortController = new AbortController();
  const signal = abortController.signal;
  const addEventListenerSpy = spyOn(signal, 'addEventListener');
  const removeEventListenerSpy = spyOn(signal, 'removeEventListener');

  const actions: string[] = [];

  await spawn(signal, async (signal, {fork}) => {
    const task = fork(async signal => {
      actions.push('fork start');
      try {
        await forever(signal);
      } catch (err: any) {
        actions.push('fork abort');
      }
    });

    actions.push('post fork');
    await delay(signal, 0);
    actions.push('pre task abort');
    task.abort();
    await delay(signal, 0);
    actions.push('post task abort');
  });

  expect(actions).toEqual([
    'fork start',
    'post fork',
    'pre task abort',
    'fork abort',
    'post task abort',
  ]);

  expect(addEventListenerSpy.callCount).toBe(1);
  expect(removeEventListenerSpy.callCount).toBe(1);
});

it('fork abort on spawn finish', async () => {
  const abortController = new AbortController();
  const signal = abortController.signal;
  const addEventListenerSpy = spyOn(signal, 'addEventListener');
  const removeEventListenerSpy = spyOn(signal, 'removeEventListener');

  const actions: string[] = [];

  await spawn(signal, async (signal, {fork}) => {
    fork(async signal => {
      actions.push('fork start');
      try {
        await forever(signal);
      } catch (err: any) {
        actions.push('fork abort');
      }
    });

    actions.push('post fork');
    await delay(signal, 0);
    actions.push('spawn finish');
  });

  expect(actions).toEqual([
    'fork start',
    'post fork',
    'spawn finish',
    'fork abort',
  ]);

  expect(addEventListenerSpy.callCount).toBe(1);
  expect(removeEventListenerSpy.callCount).toBe(1);
});

it('fork abort on spawn error', async () => {
  const abortController = new AbortController();
  const signal = abortController.signal;
  const addEventListenerSpy = spyOn(signal, 'addEventListener');
  const removeEventListenerSpy = spyOn(signal, 'removeEventListener');

  const actions: string[] = [];

  await spawn(signal, async (signal, {fork}) => {
    fork(async signal => {
      actions.push('fork start');
      try {
        await forever(signal);
      } catch (err: any) {
        actions.push('fork abort');
      }
    });

    actions.push('post fork');
    await delay(signal, 0);
    actions.push('spawn finish');
    throw new Error('the-error');
  }).catch(err => {
    actions.push(`spawn throw: ${err.message}`);
  });

  expect(actions).toEqual([
    'fork start',
    'post fork',
    'spawn finish',
    'fork abort',
    'spawn throw: the-error',
  ]);

  expect(addEventListenerSpy.callCount).toBe(1);
  expect(removeEventListenerSpy.callCount).toBe(1);
});

it('error thrown from fork', async () => {
  const abortController = new AbortController();
  const signal = abortController.signal;
  const addEventListenerSpy = spyOn(signal, 'addEventListener');
  const removeEventListenerSpy = spyOn(signal, 'removeEventListener');

  const actions: string[] = [];

  await spawn(signal, async (signal, {fork}) => {
    fork(async signal => {
      actions.push('fork start');
      await delay(signal, 0);
      actions.push('fork finish');
      throw new Error('the-error');
    });

    actions.push('post fork');

    try {
      await forever(signal);
    } catch (err: any) {
      actions.push('spawn abort');
      throw err;
    }
  }).catch(err => {
    actions.push(`spawn throw: ${err.message}`);
  });

  expect(actions).toEqual([
    'fork start',
    'post fork',
    'fork finish',
    'spawn abort',
    'spawn throw: the-error',
  ]);

  expect(addEventListenerSpy.callCount).toBe(1);
  expect(removeEventListenerSpy.callCount).toBe(1);
});

it('async defer', async () => {
  const abortController = new AbortController();
  const signal = abortController.signal;

  const deferredFn = createSpy(() => {});

  await spawn(signal, async (signal, {defer}) => {
    await delay(signal, 0);

    defer(() => {
      deferredFn();
    });
  });

  expect(deferredFn.callCount).toBe(1);
});

it('abort before spawn', async () => {
  const abortController = new AbortController();
  const signal = abortController.signal;
  const addEventListenerSpy = spyOn(signal, 'addEventListener');
  const removeEventListenerSpy = spyOn(signal, 'removeEventListener');
  abortController.abort();

  const executor = createSpy(async (signal: AbortSignal) => {});

  await expect(spawn(signal, executor)).rejects.toMatchObject({
    name: 'AbortError',
  });

  expect(executor.callCount).toBe(0);

  expect(addEventListenerSpy.callCount).toBe(0);
  expect(removeEventListenerSpy.callCount).toBe(0);
});

it('abort with custom reason during spawn execution', async () => {
  const abortController = new AbortController();
  const signal = abortController.signal;

  const customReason = new Error('Custom abort reason');
  const actions: string[] = [];

  await spawn(signal, async (signal, {fork}) => {
    fork(async signal => {
      actions.push('fork start');
      try {
        await forever(signal);
      } catch (err: any) {
        actions.push('fork abort');
      }
    });

    actions.push('post fork');
    await delay(signal, 0);
    actions.push('pre abort');
    abortController.abort(customReason);
    await delay(signal, 0);
  }).catch(err => {
    actions.push(`spawn catch: ${err.message || err.toString()}`);
  });

  expect(actions).toContain('fork start');
  expect(actions).toContain('post fork');
  expect(actions).toContain('pre abort');
  expect(actions).toContain('fork abort');
});

it('innerSignal aborted on spawn finish', async () => {
  const abortController = new AbortController();
  const signal = abortController.signal;

  let innerSignal: AbortSignal | undefined;

  await spawn(signal, async (signal, {fork}) => {
    innerSignal = signal;
    fork(async signal => {
      await forever(signal).catch(() => {});
    });

    await delay(signal, 0);
  });

  expect(innerSignal!.aborted).toBe(true);
});

it('innerSignal aborted on fork error', async () => {
  const abortController = new AbortController();
  const signal = abortController.signal;

  let innerSignal: AbortSignal | undefined;

  await spawn(signal, async (signal, {fork}) => {
    innerSignal = signal;
    fork(async signal => {
      await delay(signal, 0);
      throw new Error('fork-error');
    });

    await forever(signal).catch(() => {});
  }).catch(() => {});

  expect(innerSignal!.aborted).toBe(true);
});

it('innerSignal aborted when spawn function throws', async () => {
  const abortController = new AbortController();
  const signal = abortController.signal;

  let innerSignal: AbortSignal | undefined;
  const spawnError = new Error('spawn-error');

  await spawn(signal, async (signal, {fork}) => {
    innerSignal = signal;
    fork(async signal => {
      await forever(signal).catch(() => {});
    });

    await delay(signal, 0);
    throw spawnError;
  }).catch(() => {});

  expect(innerSignal!.aborted).toBe(true);
});
