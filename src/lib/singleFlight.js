export function createSingleFlight() {
  let activeKey = null;
  let activePromise = null;

  return {
    run(key, task) {
      if (activePromise && activeKey === key) return activePromise;

      const promise = Promise.resolve()
        .then(task)
        .finally(() => {
          if (activePromise === promise) {
            activeKey = null;
            activePromise = null;
          }
        });
      activeKey = key;
      activePromise = promise;
      return promise;
    },
    clear() {
      activeKey = null;
      activePromise = null;
    },
  };
}
