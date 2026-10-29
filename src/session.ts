/** Auth owns workspace selection. Ignore loads completed after sign-out or unmount. */
export function watchWorkspace<T>(options: {
  subscribe: (
    next: (user: { uid: string } | null) => void,
    error: (error: Error) => void,
  ) => () => void;
  load: () => Promise<T>;
  loading: () => void;
  ready: (data: T) => void;
  signedOut: () => void;
  failed: (error: Error) => void;
}) {
  let generation = 0,
    disposed = false;
  options.loading();
  const unsubscribe = options.subscribe(
    (user) => {
      if (disposed) return;
      const current = ++generation;
      if (!user) {
        options.signedOut();
        return;
      }
      options.loading();
      void options
        .load()
        .then((data) => {
          if (!disposed && current === generation) options.ready(data);
        })
        .catch((error) => {
          if (!disposed && current === generation)
            options.failed(error instanceof Error ? error : new Error(String(error)));
        });
    },
    (error) => {
      generation++;
      if (!disposed) options.failed(error);
    },
  );
  return () => {
    disposed = true;
    generation++;
    unsubscribe();
  };
}
