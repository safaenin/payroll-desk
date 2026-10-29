import { expect, it, vi } from 'vitest';
import { watchWorkspace } from './session';
function deferred<T>() {
  let resolve!: (data: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
function setup() {
  let next!: (user: { uid: string } | null) => void;
  const request = deferred<string>();
  const callbacks = {
    loading: vi.fn(),
    ready: vi.fn(),
    signedOut: vi.fn(),
    failed: vi.fn(),
    load: vi.fn(() => request.promise),
  };
  const unsubscribe = vi.fn();
  const stop = watchWorkspace({
    ...callbacks,
    subscribe: (cb) => {
      next = cb;
      return unsubscribe;
    },
  });
  return { callbacks, request, stop, unsubscribe, next: (u: { uid: string } | null) => next(u) };
}
it('restores saved authenticated workspace without displaying demo or empty records', async () => {
  const s = setup();
  expect(s.callbacks.loading).toHaveBeenCalledOnce();
  expect(s.callbacks.signedOut).not.toHaveBeenCalled();
  s.next({ uid: 'owner' });
  expect(s.callbacks.load).toHaveBeenCalledOnce();
  expect(s.callbacks.ready).not.toHaveBeenCalled();
  s.request.resolve('saved employees');
  await Promise.resolve();
  expect(s.callbacks.ready).toHaveBeenCalledWith('saved employees');
  expect(s.callbacks.signedOut).not.toHaveBeenCalled();
});
it('shows signed-out state only after auth confirms sign-out', () => {
  const s = setup();
  s.next(null);
  expect(s.callbacks.signedOut).toHaveBeenCalledOnce();
  expect(s.callbacks.load).not.toHaveBeenCalled();
});
it('does not restore private data after sign-out while loading', async () => {
  const s = setup();
  s.next({ uid: 'owner' });
  s.next(null);
  s.request.resolve('private data');
  await Promise.resolve();
  expect(s.callbacks.ready).not.toHaveBeenCalled();
});
it('does not apply a load from an unmounted subscription', async () => {
  const s = setup();
  s.next({ uid: 'owner' });
  s.stop();
  s.request.resolve('old data');
  await Promise.resolve();
  expect(s.callbacks.ready).not.toHaveBeenCalled();
  expect(s.unsubscribe).toHaveBeenCalledOnce();
});
it('surfaces cloud loading errors without falling back to demo', async () => {
  const s = setup();
  s.next({ uid: 'owner' });
  s.request.reject(new Error('permission denied'));
  await Promise.resolve();
  await Promise.resolve();
  expect(s.callbacks.failed).toHaveBeenCalledWith(
    expect.objectContaining({ message: 'permission denied' }),
  );
  expect(s.callbacks.signedOut).not.toHaveBeenCalled();
});
it('ignores a stale load when the authenticated account changes', async () => {
  let next!: (u: { uid: string } | null) => void;
  const first = deferred<string>(),
    second = deferred<string>(),
    ready = vi.fn();
  watchWorkspace({
    subscribe: (cb) => {
      next = cb;
      return () => {};
    },
    load: vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise),
    ready,
    loading: vi.fn(),
    signedOut: vi.fn(),
    failed: vi.fn(),
  });
  next({ uid: 'one' });
  next({ uid: 'two' });
  second.resolve('current');
  await Promise.resolve();
  first.resolve('stale');
  await Promise.resolve();
  expect(ready).toHaveBeenCalledTimes(1);
  expect(ready).toHaveBeenCalledWith('current');
});
