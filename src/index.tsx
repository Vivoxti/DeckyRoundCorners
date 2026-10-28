import { definePlugin, routerHook } from "@decky/api";
import {
  ButtonItem, PanelSection, PanelSectionRow, SliderField,
  ToggleField, staticClasses, findSP,
} from "@decky/ui";
import { Component, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { findCompositionHook } from "./composition";
import { HIDDEN, getComposition, getForegroundGame, getRunningGame, getRunningGameName, subscribeForeground } from "./foreground";
import { DEFAULT_SETTINGS, MAX_RADIUS, createSettingsStore } from "./model.mjs";
import { useVolumePopinShown } from "./volume";
import { CORNER_POSITIONS, createCornerTexture, getCornerGeometry, getLetterboxInset, getMaxRadius } from "./geometry.mjs";

const COMPONENT_NAME = "DeckyRoundCorners.Overlay";
const version = __PLUGIN_VERSION__;
const SAVE_DELAY_MS = 400;
const FADE_MS = 400;
// Steam's volume popin slides in over 0.22 s; the top-left corner clears it as fast.
const POPIN_FADE_MS = 220;
// When a menu, Quick Access or the library closes over a game, Steam switches
// to Hidden composition at once, cutting off their ~310 ms exit animation.
// The corners' request waits until it is over, so Steam looks unchanged.
const SETTLE_MS = 400;

type Viewport = { view: Window, width: number, height: number, dpr: number };
const readViewport = (view: Window): Viewport => ({ view, width: view.innerWidth, height: view.innerHeight, dpr: view.devicePixelRatio });
const sameViewport = (a: Viewport, b: Viewport) =>
  a.view === b.view && a.width === b.width && a.height === b.height && a.dpr === b.dpr;

export default definePlugin(() => {
  let storage: Storage | undefined;
  try { storage = window.localStorage; } catch { /* Reported when saving. */ }
  // Slider drags update the overlay immediately; storage is written once they settle.
  const store = createSettingsStore(storage, { saveDelay: SAVE_DELAY_MS });
  const useComposition = findCompositionHook();
  if (!useComposition) {
    store.setCompatibilityError("This Steam version's overlay API was not found. Corners are unavailable.");
  }
  const useSettings = () => useSyncExternalStore(store.subscribe, store.getSnapshot);

  function CompositionRequest() {
    // Steam releases the request when this unmounts.
    useComposition!(1, "Round Corners");
    return null;
  }

  function CornerSurface({ radius, shape, letterbox, shown }: { radius: number, shape: number, letterbox: boolean, shown: boolean }) {
    // Steam's interface is visible by itself everywhere except over an
    // uncovered game, so Notification composition is requested only there.
    const game = useSyncExternalStore(subscribeForeground, getForegroundGame);
    const composition = useSyncExternalStore(subscribeForeground, getComposition);
    const [settledGame, setSettledGame] = useState<number | null>(null);
    useEffect(() => {
      setSettledGame(null);
      if (game === null) return;
      const timer = setTimeout(() => setSettledGame(game), SETTLE_MS);
      return () => clearTimeout(timer);
    }, [game]);
    // Without a readable composition, request it all the time as before.
    const requesting = composition === null || (game !== null && settledGame === game);
    // Plugin JS can execute in Steam's hidden shared document. Its body is
    // not necessarily the visible GamepadUI (SP) window's body.
    const display = findSP();
    const target = display?.document.body;
    if (!target) throw new Error("Visible Steam GamepadUI window was not found");
    const [measured, setViewport] = useState(() => readViewport(display));
    // A recreated SP window must not inherit the previous window's size.
    const viewport = measured.view === display ? measured : readViewport(display);
    useEffect(() => {
      const onResize = () => setViewport((previous) => {
        const next = readViewport(display);
        return sameViewport(previous, next) ? previous : next;
      });
      onResize();
      display.addEventListener("resize", onResize);
      display.visualViewport?.addEventListener("resize", onResize);
      return () => {
        display.removeEventListener("resize", onResize);
        display.visualViewport?.removeEventListener("resize", onResize);
      };
    }, [display]);
    // Kept within the header and footer for the current UI scale; the setting itself is not changed.
    const fitted = Math.min(radius, getMaxRadius(viewport.width, viewport.dpr));
    const { physicalRadius, cssSize } = getCornerGeometry(fitted, viewport.width, viewport.height, viewport.dpr);
    // A 16:9 game is drawn between black bars; its corners sit at the bars' inner edges.
    const inset = letterbox ? getLetterboxInset(viewport.width, viewport.height, viewport.dpr) / viewport.dpr : 0;
    const texture = useMemo(() => createCornerTexture(display.document, physicalRadius, shape), [display, physicalRadius, shape]);
    // Corners fade in when mounted and whenever Steam's window reappears.
    // While Steam's window is hidden nothing is drawn, so they reset to
    // transparent; fading out on disable keeps the request until it ends.
    const [appeared, setAppeared] = useState(false);
    useEffect(() => {
      const frame = display.requestAnimationFrame(() => setAppeared(true));
      return () => display.cancelAnimationFrame(frame);
    }, [display]);
    const opacity = shown && appeared && composition !== HIDDEN ? 1 : 0;
    // The top-left corner steps aside for Steam's volume popin.
    const volumePopin = useVolumePopinShown(display.document);
    // All corners reuse the same antialiased texture at native pixel size.
    // Mirroring an already rasterized mask avoids SVG tessellation differences.
    return createPortal(<div data-round-corners={version}
      aria-hidden="true"
      style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 2147483647 }}>
      {requesting && <CompositionRequest />}
      {CORNER_POSITIONS.map((position, index) => (
        <img key={index} src={texture} alt="" draggable={false}
          style={{ ...position, ...("top" in position ? { top: inset } : { bottom: inset }),
            position: "fixed", width: cssSize, height: cssSize,
            maxWidth: "none", maxHeight: "none", margin: 0, padding: 0, border: 0,
            imageRendering: "pixelated", display: "block", pointerEvents: "none",
            opacity: index === 0 && volumePopin ? 0 : opacity,
            transition: `opacity ${index === 0 && volumePopin ? POPIN_FADE_MS : FADE_MS}ms ease-out` }} />
      ))}
    </div>, target);
  }

  class OverlayBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
    state = { failed: false };
    static getDerivedStateFromError() { return { failed: true }; }
    componentDidCatch(error: Error) {
      console.error("[Round Corners] Overlay failed", error);
      store.setCompatibilityError(`Overlay error: ${error.message}`);
    }
    render() { return this.state.failed ? null : this.props.children; }
  }

  function Overlay() {
    const settings = useSettings();
    const game = useSyncExternalStore(subscribeForeground, getForegroundGame);
    const active = settings.enabled && settings.radius > 0 && !settings.compatibilityError;
    // Fading out at radius zero keeps the last visible radius.
    const radius = useRef(settings.radius);
    if (settings.radius > 0) radius.current = settings.radius;
    const [mounted, setMounted] = useState(active);
    useEffect(() => {
      if (active) { setMounted(true); return; }
      const timer = setTimeout(() => setMounted(false), FADE_MS);
      return () => clearTimeout(timer);
    }, [active]);
    if (settings.compatibilityError || (!active && !mounted)) return null;
    const letterbox = game !== null && settings.letterboxApps.includes(game);
    return <OverlayBoundary>
      <CornerSurface radius={radius.current} shape={settings.shape} letterbox={letterbox} shown={active} />
    </OverlayBoundary>;
  }

  function Content() {
    const settings = useSettings();
    const runningGame = useSyncExternalStore(subscribeForeground, getRunningGame);
    const display = findSP();
    const maxRadius = display ? Math.min(MAX_RADIUS, getMaxRadius(display.innerWidth, display.devicePixelRatio)) : MAX_RADIUS;
    if (settings.unloaded) return <PanelSection title="Display corners">
      <PanelSectionRow>
        <div role="status">Round Corners was reloaded. Go back and open it again.</div>
      </PanelSectionRow>
    </PanelSection>;
    return <PanelSection title="Display corners">
      <PanelSectionRow>
        <ToggleField label="Enable rounded corners"
          description="Black corners over the game and Steam interface."
          checked={settings.enabled && !settings.compatibilityError}
          disabled={Boolean(settings.compatibilityError)}
          onChange={(enabled) => store.update({ enabled })} />
      </PanelSectionRow>
      <PanelSectionRow>
        <SliderField label="Corner radius" value={Math.min(settings.radius, maxRadius)}
          min={0} max={maxRadius} step={1} showValue valueSuffix=" px"
          description={`Pixels on the Deck's 1280-pixel-wide screen, up to ${maxRadius} at the current UI scale: larger corners would reach past the header and footer into menus and the Store, which Steam draws above them. Zero hides the corners.`}
          onChange={(radius) => store.update({ radius })} />
      </PanelSectionRow>
      <PanelSectionRow>
        <SliderField label="Corner shape" value={settings.shape}
          min={-100} max={100} step={1} showValue valueSuffix="%" resetValue={0}
          description="−100: flatter · 0: circle · +100: squircle. Keeps the same corner size."
          onChange={(shape) => store.update({ shape })} />
      </PanelSectionRow>
      {runningGame !== null && <PanelSectionRow>
        <ToggleField label="16:9 game"
          description={`For ${getRunningGameName() ?? "this game"}: while it is on screen, the corners move to the edges of its 16:9 picture. Steam's interface keeps the screen corners.`}
          checked={settings.letterboxApps.includes(runningGame)}
          onChange={(letterbox) => store.update({ letterboxApps: letterbox
            ? [...settings.letterboxApps, runningGame]
            : settings.letterboxApps.filter((appid) => appid !== runningGame) })} />
      </PanelSectionRow>}
      <PanelSectionRow>
        <ButtonItem layout="below" onClick={() => store.update({ ...DEFAULT_SETTINGS, letterboxApps: settings.letterboxApps })}>
          Reset to defaults
        </ButtonItem>
      </PanelSectionRow>
      {(settings.compatibilityError || settings.persistenceError) && <PanelSectionRow>
        <div role="status">{settings.compatibilityError || settings.persistenceError}</div>
      </PanelSectionRow>}
      <PanelSectionRow>
        <div style={{ fontSize: 12, color: "#b8bcbf" }}>
          v{version}. Steam's side menus, Quick Access and the Store are drawn above the corners.
        </div>
      </PanelSectionRow>
    </PanelSection>;
  }

  routerHook.addGlobalComponent(COMPONENT_NAME, Overlay);
  return {
    name: "Round Corners",
    titleView: <div className={staticClasses.Title}>Round Corners</div>,
    icon: <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none"
      aria-hidden="true" focusable="false" style={{ flexShrink: 0, verticalAlign: "middle" }}>
      <rect x="3" y="5" width="18" height="14" rx="4" stroke="currentColor" strokeWidth="2" />
    </svg>,
    content: <Content />,
    onDismount() {
      store.unload();
      routerHook.removeGlobalComponent(COMPONENT_NAME);
    },
  };
});
