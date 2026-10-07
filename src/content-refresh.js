// Only mounted content registers work; refreshing never reloads the document.
export function createContentRefresh() {
  const handlers = new Map(), pending = new Map();
  return {
    subscribe(page, handler) {
      if (!handlers.has(page)) handlers.set(page, new Set());
      handlers.get(page).add(handler);
      return () => handlers.get(page)?.delete(handler);
    },
    run(page) {
      if (pending.has(page)) return pending.get(page);
      const work = [...(handlers.get(page) || [])];
      const promise = Promise.all(work.map(fn => Promise.resolve().then(fn))).finally(() => pending.delete(page));
      pending.set(page, promise);
      return promise;
    },
    has: page => !!handlers.get(page)?.size,
  };
}
export const contentRefresh = createContentRefresh();
