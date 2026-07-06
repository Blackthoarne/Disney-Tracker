// Tiny pub/sub event bus for cross-module communication.

export function createBus() {
  const listeners = new Map(); // event -> Set<fn>

  return {
    on(event, fn) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(fn);
      return () => this.off(event, fn);
    },
    off(event, fn) {
      listeners.get(event)?.delete(fn);
    },
    emit(event, payload) {
      const set = listeners.get(event);
      if (!set) return;
      for (const fn of [...set]) {
        try {
          fn(payload);
        } catch (err) {
          console.error(`bus listener for "${event}" threw:`, err);
        }
      }
    },
  };
}

export default createBus;
