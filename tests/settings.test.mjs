import test from "node:test";
import assert from "node:assert/strict";
import { STORAGE_KEY, createSettingsStore, normalizeSettings } from "../src/model.mjs";

test("damaged and old settings cannot enable the overlay or produce invalid radii", () => {
  for (const value of [null, false, [], "bad", { enabled: "true", radius: NaN }]) {
    assert.deepEqual(normalizeSettings(value), { enabled: false, radius: 24, shape: 0, letterboxApps: [] });
  }
  assert.deepEqual(normalizeSettings({ enabled: true, radius: -1 }), { enabled: true, radius: 0, shape: 0, letterboxApps: [] });
  assert.equal(normalizeSettings({ radius: 100000 }).radius, 96);
  assert.equal(normalizeSettings({ radius: 31.8 }).radius, 32);
  assert.equal(normalizeSettings({ radius: Infinity }).radius, 24);
});

test("settings survive a reload and unsubscription removes the listener", () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const store = createSettingsStore(storage);
  let changes = 0;
  const unsubscribe = store.subscribe(() => changes++);
  store.update({ radius: 48, enabled: true, shape: -37 });
  assert.equal(changes, 1);
  unsubscribe();
  store.update({ radius: 36 });
  assert.equal(changes, 1);
  assert.equal(JSON.parse(values.get(STORAGE_KEY)).radius, 36);
  const restored = createSettingsStore(storage).getSnapshot();
  assert.equal(restored.enabled, true);
  assert.equal(restored.radius, 36);
  assert.equal(restored.shape, -37);
});

test("old saved settings migrate to a circle and shape input is clamped", () => {
  assert.deepEqual(normalizeSettings({ enabled: true, radius: 47 }), { enabled: true, radius: 47, shape: 0, letterboxApps: [] });
  assert.equal(normalizeSettings({ shape: -1000 }).shape, -100);
  assert.equal(normalizeSettings({ shape: 1000 }).shape, 100);
  for (const shape of [NaN, Infinity, "50", null]) assert.equal(normalizeSettings({ shape }).shape, 0);
});

test("16:9 games are kept as unique positive app IDs and survive a reload", () => {
  assert.deepEqual(normalizeSettings({ letterboxApps: [367520, "590380", 0, -5, 1.5, NaN, 367520, 590380] }).letterboxApps,
    [367520, 590380]);
  assert.deepEqual(normalizeSettings({ letterboxApps: "367520" }).letterboxApps, []);
  assert.equal(normalizeSettings({ letterboxApps: Array.from({ length: 2000 }, (_, i) => i + 1) }).letterboxApps.length, 1000);
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  createSettingsStore(storage).update({ letterboxApps: [2427700] });
  assert.deepEqual(createSettingsStore(storage).getSnapshot().letterboxApps, [2427700]);
});

test("an unloaded store saves pending changes and ignores a stale panel's updates", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const store = createSettingsStore(storage, { saveDelay: 400 });
  let changes = 0;
  store.subscribe(() => changes++);
  store.update({ radius: 40 });
  store.unload();
  assert.equal(JSON.parse(values.get(STORAGE_KEY)).radius, 40);
  assert.equal(store.getSnapshot().unloaded, true);
  assert.equal(changes, 2, "the panel re-renders to say it was reloaded");
  store.update({ radius: 10, letterboxApps: [1] });
  t.mock.timers.tick(1000);
  assert.equal(JSON.parse(values.get(STORAGE_KEY)).radius, 40);
  assert.equal(store.getSnapshot().radius, 40);
});

test("delayed saving writes only the settled value and flushes on demand", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const writes = [];
  const store = createSettingsStore({ getItem: () => null, setItem: (_key, value) => writes.push(JSON.parse(value)) }, { saveDelay: 400 });
  for (const radius of [30, 40, 50]) store.update({ radius });
  assert.equal(store.getSnapshot().radius, 50, "the overlay sees every change immediately");
  assert.equal(writes.length, 0);
  t.mock.timers.tick(399);
  assert.equal(writes.length, 0);
  t.mock.timers.tick(1);
  assert.deepEqual(writes.map((saved) => saved.radius), [50]);
  store.update({ shape: 20 });
  store.flush();
  assert.equal(writes.at(-1).shape, 20);
  t.mock.timers.tick(1000);
  assert.equal(writes.length, 2, "a flushed save is not repeated");
  store.flush();
  assert.equal(writes.length, 2);
});

test("a delayed save failure is reported to subscribers", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const store = createSettingsStore({ getItem: () => null, setItem() { throw Error("quota"); } }, { saveDelay: 400 });
  let changes = 0;
  store.subscribe(() => changes++);
  store.update({ enabled: true });
  assert.equal(store.getSnapshot().persistenceError, "");
  t.mock.timers.tick(400);
  assert.equal(changes, 2);
  assert.match(store.getSnapshot().persistenceError, /could not be saved/);
});

test("storage failures leave the overlay controllable and report unsaved settings", () => {
  const store = createSettingsStore({ getItem() { return "broken JSON"; }, setItem() { throw Error("quota"); } });
  assert.equal(store.getSnapshot().enabled, false);
  assert.ok(store.getSnapshot().persistenceError);
  store.update({ enabled: true, radius: 32 });
  assert.equal(store.getSnapshot().enabled, true);
  assert.equal(store.getSnapshot().radius, 32);
  assert.match(store.getSnapshot().persistenceError, /could not be saved/);
  store.update({ enabled: false });
  assert.equal(store.getSnapshot().enabled, false);
});
