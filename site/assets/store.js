// Shared page state so the recap, the explorer and the reflection tell one story. In memory
// only: nothing is stored or sent anywhere. Recaps are kept per source and checkpoint, under
// keys like "example-0@14" (example practice A at Day 14) and "own@7" (Preview numbers at
// Day 7). The reflection picks one source and one checkpoint.
const state = { mode: "examples", source: "example-0", lastExample: "example-0", day: 14, recaps: {}, priority: null, impacts: {} };
const listeners = { recap: new Set(), priority: new Set(), impact: new Set() };

function emit(topic) {
  for (const fn of listeners[topic]) fn(state);
}

export const store = {
  state,
  currentRecap: () => state.recaps[`${state.source}@${state.day}`] ?? null,
  on(topic, fn) {
    listeners[topic].add(fn);
  },
  setMode(mode) {
    state.mode = mode;
    store.setSource(mode === "preview" ? "own" : state.lastExample);
  },
  setSource(key) {
    state.source = key;
    if (key.startsWith("example-")) state.lastExample = key;
    emit("recap");
  },
  setDay(day) {
    state.day = day;
    emit("recap");
  },
  putRecap(key, recap) {
    state.recaps[key] = recap;
  },
  refreshRecap() {
    emit("recap");
  },
  setPriority(key) {
    state.priority = key;
    emit("priority");
  },
  /** impacts: one entry per workflow (null while its numbers are invalid). */
  setImpacts(impacts) {
    state.impacts = impacts;
    emit("impact");
  },
};
