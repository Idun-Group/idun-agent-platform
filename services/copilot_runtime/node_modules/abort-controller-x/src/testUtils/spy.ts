export interface Spy<T extends (...args: any[]) => any> {
  (...args: Parameters<T>): ReturnType<T>;
  readonly calls: ReadonlyArray<Parameters<T>>;
  readonly callCount: number;
  reset(): void;
}

function createDefaultImplementation(): (...args: unknown[]) => unknown {
  return () => undefined;
}

export function createSpy<T extends (...args: any[]) => any>(
  implementation?: T,
  thisArg?: unknown,
): Spy<T> {
  const recordedCalls: Parameters<T>[] = [];
  const impl = (implementation ?? (createDefaultImplementation() as T)) as T;

  const spy = function (this: unknown, ...args: Parameters<T>): ReturnType<T> {
    recordedCalls.push(args);
    const context = thisArg !== undefined ? thisArg : this;
    return impl.apply(context, args);
  } as Spy<T>;

  Object.defineProperty(spy, 'calls', {
    value: recordedCalls,
    writable: false,
  });

  Object.defineProperty(spy, 'callCount', {
    get() {
      return recordedCalls.length;
    },
  });

  Object.defineProperty(spy, 'reset', {
    value() {
      recordedCalls.length = 0;
    },
  });

  return spy;
}

export function spyOn<T extends object, K extends keyof T>(
  target: T,
  property: K,
): Spy<Extract<T[K], (...args: any[]) => any>> {
  const original = target[property];

  if (typeof original !== 'function') {
    throw new TypeError(`Property "${String(property)}" is not callable`);
  }

  const spy = createSpy(original as Extract<T[K], (...args: any[]) => any>, target);

  (target as Record<K, unknown>)[property] = spy as unknown as T[K];

  return spy;
}
