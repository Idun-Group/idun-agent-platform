import expect from 'expect';
import {forever} from './forever';
import {spyOn} from './testUtils/spy';
import {nextTick} from './utils/nextTick';

it('forever', async () => {
  const abortController = new AbortController();
  const signal = abortController.signal;
  const addEventListenerSpy = spyOn(signal, 'addEventListener');
  const removeEventListenerSpy = spyOn(signal, 'removeEventListener');

  let result: PromiseSettledResult<string | number> | undefined;

  forever(signal).then(
    value => {
      result = {status: 'fulfilled', value};
    },
    reason => {
      result = {status: 'rejected', reason};
    },
  );

  await nextTick();

  expect(result).toBeUndefined();

  abortController.abort();

  await nextTick();

  expect(result).toMatchObject({
    status: 'rejected',
    reason: {name: 'AbortError'},
  });

  expect(addEventListenerSpy.callCount).toBe(1);
  expect(removeEventListenerSpy.callCount).toBe(1);
});
