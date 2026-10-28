export const STORAGE_KEY = "decky-round-corners:v1";
/** @type {Readonly<{ enabled: boolean, radius: number, shape: number, letterboxApps: readonly number[] }>} */
export const DEFAULT_SETTINGS = Object.freeze({ enabled: false, radius: 24, shape: 0, letterboxApps: Object.freeze([]) });
// Saved values stay up to this; the overlay and slider use getMaxRadius for the
// current UI scale, so a setting comes back when the scale does.
export const MAX_RADIUS = 96;
const MAX_LETTERBOX_APPS = 1000;

/** @param {unknown} input */
export function normalizeSettings(input) {
  const value = input && typeof input === "object" ? input : {};
  const radius = "radius" in value ? value.radius : undefined;
  const shape = "shape" in value ? value.shape : undefined;
  const apps = "letterboxApps" in value && Array.isArray(value.letterboxApps) ? value.letterboxApps : [];
  return {
    enabled: "enabled" in value && value.enabled === true,
    radius: typeof radius === "number" && Number.isFinite(radius)
      ? Math.min(MAX_RADIUS, Math.max(0, Math.round(radius)))
      : DEFAULT_SETTINGS.radius,
    shape: typeof shape === "number" && Number.isFinite(shape)
      ? Math.min(100, Math.max(-100, Math.round(shape)))
      : DEFAULT_SETTINGS.shape,
    // App IDs of games that only run in 16:9.
    letterboxApps: [...new Set(apps.filter((appid) => Number.isSafeInteger(appid) && appid > 0))]
      .slice(0, MAX_LETTERBOX_APPS),
  };
}

/** Without a save delay, every update is written immediately.
 * @param {Pick<Storage, "getItem" | "setItem"> | undefined} storage
 * @param {{ saveDelay?: number }} [options]
 */
export function createSettingsStore(storage, { saveDelay = 0 } = {}) {
  let settings = { ...DEFAULT_SETTINGS };
  let persistenceError = "";
  try {
    const saved = storage?.getItem(STORAGE_KEY);
    if (saved) settings = normalizeSettings(JSON.parse(saved));
  } catch {
    persistenceError = "Settings could not be loaded. Defaults are in use.";
  }
  let snapshot = { ...settings, persistenceError, compatibilityError: "", unloaded: false };
  /** @type {Set<() => void>} */
  const listeners = new Set();
  const notify = () => listeners.forEach((listener) => listener());
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let saveTimer;

  function persist() {
    try {
      if (!storage) throw new Error("Storage unavailable");
      storage.setItem(STORAGE_KEY, JSON.stringify(settings));
      persistenceError = "";
    } catch {
      persistenceError = "Settings work for this session but could not be saved.";
    }
    snapshot = { ...snapshot, persistenceError };
  }
  function savePending() {
    if (saveTimer === undefined) return;
    clearTimeout(saveTimer);
    saveTimer = undefined;
    const previous = snapshot.persistenceError;
    persist();
    if (snapshot.persistenceError !== previous) notify();
  }

  return {
    getSnapshot: () => snapshot,
    /** @param {() => void} listener */
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    /** @param {Partial<typeof DEFAULT_SETTINGS>} patch */
    update(patch) {
      if (snapshot.unloaded) return;
      settings = normalizeSettings({ ...settings, ...patch });
      snapshot = { ...snapshot, ...settings };
      if (saveDelay > 0) {
        if (saveTimer !== undefined) clearTimeout(saveTimer);
        saveTimer = setTimeout(savePending, saveDelay);
      } else {
        persist();
      }
      notify();
    },
    /** Writes a delayed save now. */
    flush: savePending,
    /** Saves pending changes and ignores later updates. After a reload Decky
     * can keep showing the old panel, which must not overwrite the settings
     * of the plugin that replaced it. */
    unload() {
      savePending();
      snapshot = { ...snapshot, unloaded: true };
      notify();
    },
    /** @param {string} message */
    setCompatibilityError(message) {
      snapshot = { ...snapshot, compatibilityError: message };
      notify();
    },
  };
}
