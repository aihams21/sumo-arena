/* Test bootstrap — must be imported FIRST so the localStorage stub exists
   before any module that reads the save slot at import time. */

const store = new Map();

export const memStore = store;

globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); },
  clear: () => { store.clear(); },
  key: (i) => Array.from(store.keys())[i] ?? null,
  get length() { return store.size; }
};

if (typeof globalThis.window === 'undefined') {
  globalThis.window = {
    addEventListener() {}, removeEventListener() {},
    devicePixelRatio: 1, innerWidth: 1280, innerHeight: 800
  };
}
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = () => 0;
  globalThis.cancelAnimationFrame = () => {};
}
if (!globalThis.performance) globalThis.performance = { now: () => 0 };

if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    addEventListener() {}, removeEventListener() {},
    visibilityState: 'visible',
    documentElement: { lang: 'en', dir: 'ltr' },
    body: { classList: { add() {}, remove() {}, toggle() {} } }
  };
}