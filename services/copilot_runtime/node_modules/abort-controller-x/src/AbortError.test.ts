import expect from 'expect';
import {
  AbortError,
  catchAbortError,
  isAbortError,
  rethrowAbortError,
  throwIfAborted,
} from './AbortError';

it('isAbortError', () => {
  expect(isAbortError({})).toBe(false);
  expect(isAbortError(undefined)).toBe(false);
  expect(isAbortError(null)).toBe(false);

  expect(isAbortError(new AbortError())).toBe(true);
});

it('throwIfAborted', () => {
  const abortController = new AbortController();

  expect(() => throwIfAborted(abortController.signal)).not.toThrow();

  abortController.abort();

  expect(() => throwIfAborted(abortController.signal)).toThrow(AbortError);
});

it('rethrowAbortError', () => {
  expect(() => rethrowAbortError(new AbortError())).toThrow(AbortError);
  expect(() => rethrowAbortError(new Error())).not.toThrow();
});

it('catchAbortError', () => {
  expect(() => catchAbortError(new AbortError())).not.toThrow();
  expect(() => catchAbortError(new Error())).toThrow();
});

it('AbortError with custom message', () => {
  const error = new AbortError('Custom abort message');
  expect(error.message).toBe('Custom abort message');
  expect(error.name).toBe('AbortError');
});

it('AbortError default message', () => {
  const error = new AbortError();
  expect(error.message).toBe('The operation has been aborted');
  expect(error.name).toBe('AbortError');
});

it('AbortError with captureStackTrace disabled', () => {
  const error = new AbortError('Test message', false);
  expect(error.message).toBe('Test message');
  expect(error.name).toBe('AbortError');
  expect(error.stack).toBe('');

  expect(isAbortError(error)).toBe(true);
  expect(error).toBeInstanceOf(Error);
  expect(error).toBeInstanceOf(AbortError);
});

it('AbortError with captureStackTrace enabled', () => {
  const error = new AbortError('Test message', true);
  expect(error.message).toBe('Test message');
  expect(error.name).toBe('AbortError');
  expect(error.stack).toContain('src/AbortError.test.ts');

  expect(isAbortError(error)).toBe(true);
  expect(error).toBeInstanceOf(Error);
  expect(error).toBeInstanceOf(AbortError);
});

it('throwIfAborted with custom reason', () => {
  const abortController = new AbortController();
  const customReason = new Error('Custom reason');
  abortController.abort(customReason);

  expect(() => throwIfAborted(abortController.signal)).toThrow(AbortError);
});
