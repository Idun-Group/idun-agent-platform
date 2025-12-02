import expect from 'expect';
import {spyOn} from './testUtils/spy';
import {nextTick} from './utils/nextTick';
import {waitForEvent} from './waitForEvent';

it('external abort', async () => {
  const abortController = new AbortController();
  const signal = abortController.signal;
  const addEventListenerSpy = spyOn(signal, 'addEventListener');
  const removeEventListenerSpy = spyOn(signal, 'removeEventListener');

  const eventTarget = new AbortController().signal;
  const eventRemoveListenerSpy = spyOn(eventTarget, 'removeEventListener');

  let result: PromiseSettledResult<any> | undefined;

  waitForEvent(signal, eventTarget, 'test').then(
    value => {
      result = {status: 'fulfilled', value};
    },
    reason => {
      result = {status: 'rejected', reason};
    },
  );

  expect(eventRemoveListenerSpy.callCount).toBe(0);

  abortController.abort();

  await nextTick();

  expect(result).toMatchObject({
    status: 'rejected',
    reason: {name: 'AbortError'},
  });
  expect(eventRemoveListenerSpy.callCount).toBe(1);

  expect(addEventListenerSpy.callCount).toBe(1);
  expect(removeEventListenerSpy.callCount).toBe(1);
});

it('fulfill', async () => {
  const abortController = new AbortController();
  const signal = abortController.signal;
  const addEventListenerSpy = spyOn(signal, 'addEventListener');
  const removeEventListenerSpy = spyOn(signal, 'removeEventListener');

  const eventTargetController = new AbortController();
  const eventTarget = eventTargetController.signal;
  const eventRemoveListenerSpy = spyOn(eventTarget, 'removeEventListener');

  let result: PromiseSettledResult<any> | undefined;

  waitForEvent(signal, eventTarget, 'abort').then(
    value => {
      result = {status: 'fulfilled', value};
    },
    reason => {
      result = {status: 'rejected', reason};
    },
  );

  eventTargetController.abort();

  await nextTick();

  expect(result).toMatchObject({
    status: 'fulfilled',
    value: {type: 'abort'},
  });
  expect(eventRemoveListenerSpy.callCount).toBe(1);

  expect(addEventListenerSpy.callCount).toBe(1);
  expect(removeEventListenerSpy.callCount).toBe(1);
});
