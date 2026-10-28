import { Router } from "@decky/ui";

// Steam internals, checked on a Deck in October 2026; they can change with
// Steam updates. Every lookup tolerates their absence.
type FocusedAppid = { Value: number, Subscribe(callback: () => void): { Unsubscribe(): void } };
type ObservableValue = { observe_(listener: () => void): () => void };
type CompositionStore = { m_eLatestCompositionState: number, m_currentlyFocusedAppid: FocusedAppid };
type GamepadWindow = { MainRunningApp?: { appid: number | string, display_name?: string }, m_CompositionStateStore?: CompositionStore };

// Steam's composition values. Hidden shows only the game; Notification also
// shows Steam's window without taking input. Menus, Quick Access and the
// library raise it above both.
export const HIDDEN = 0;
const NOTIFICATION = 1;

const getWindow = () => Router?.WindowStore?.GamepadUIMainWindowInstance as unknown as GamepadWindow | undefined;

/** The running game's app ID, or null. */
export function getRunningGame(): number | null {
  const appid = Number(getWindow()?.MainRunningApp?.appid);
  return appid > 0 ? appid : null;
}

export const getRunningGameName = () => getWindow()?.MainRunningApp?.display_name;

/** Steam's current composition, or null if it cannot be read. */
export function getComposition(): number | null {
  const composition = getWindow()?.m_CompositionStateStore?.m_eLatestCompositionState;
  return typeof composition === "number" ? composition : null;
}

/** The running game's app ID while it has focus and nothing covers it, or null.
 * Focus excludes the few seconds of launch when the composition is already
 * low but the game window does not exist yet. */
export function getForegroundGame(): number | null {
  const store = getWindow()?.m_CompositionStateStore;
  const appid = getRunningGame();
  const composition = getComposition();
  if (!store || appid === null || composition === null || composition > NOTIFICATION) return null;
  return store.m_currentlyFocusedAppid.Value === appid ? appid : null;
}

/** Calls the listener on every focus or composition change; both are events, not polling. */
export function subscribeForeground(listener: () => void): () => void {
  const store = getWindow()?.m_CompositionStateStore;
  if (!store) return () => {};
  const subscriptions: (() => void)[] = [];
  try {
    const focus = store.m_currentlyFocusedAppid.Subscribe(listener);
    subscriptions.push(() => focus.Unsubscribe());
    // Focus follows menus 20–130 ms late; the composition changes in the same frame.
    const mobx = Object.getOwnPropertySymbols(store).find((symbol) => symbol.description === "mobx administration");
    const composition = mobx && (store as unknown as Record<symbol, { values_?: Map<string, ObservableValue> }>)[mobx]
      ?.values_?.get("m_eLatestCompositionState");
    if (composition) subscriptions.push(composition.observe_(listener));
    else console.warn("[Round Corners] Composition changes are not observable; following focus only");
  } catch (error) {
    console.warn("[Round Corners] Foreground tracking failed", error);
  }
  return () => subscriptions.forEach((unsubscribe) => unsubscribe());
}
