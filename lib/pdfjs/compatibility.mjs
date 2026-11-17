// PDF.js legacy builds expect Promise.withResolvers in both document and worker.
if (typeof Promise.withResolvers !== 'function') {
  Object.defineProperty(Promise, 'withResolvers', {
    configurable: true,
    writable: true,
    value: function withResolvers() {
      let resolve;
      let reject;
      const promise = new this((onResolve, onReject) => {
        if (resolve !== undefined || reject !== undefined) throw new TypeError('Promise executor already initialized');
        resolve = onResolve;
        reject = onReject;
      });
      if (typeof resolve !== 'function' || typeof reject !== 'function') throw new TypeError('Invalid Promise constructor');
      return { promise, resolve, reject };
    }
  });
}
