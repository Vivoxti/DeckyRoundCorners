import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import React, { act, useEffect } from "react";
import * as JSX from "react/jsx-runtime";
import * as ReactDOM from "react-dom";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";

test("real React mounts into visible SP, updates live, releases effects and removes portals", async () => {
  const hidden = new JSDOM('<title>SharedJSContext</title><div id="globals"></div>');
  const visible = new JSDOM('<title>SP</title><div id="panel"></div><div class="popin popin-hidden"></div>', { pretendToBeVisual: true });
  Object.defineProperty(visible.window, "innerWidth", { value: 1280, writable: true });
  Object.defineProperty(visible.window, "innerHeight", { value: 800, writable: true });
  visible.window.HTMLCanvasElement.prototype.getContext = () => ({
    createImageData: (width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }),
    putImageData() {},
  });
  let textureCreations = 0;
  visible.window.HTMLCanvasElement.prototype.toDataURL = () => {
    textureCreations++;
    return "data:image/png;base64,test";
  };
  const recreated = new JSDOM('<title>SP</title>', { pretendToBeVisual: true });
  Object.defineProperty(recreated.window, "innerWidth", { value: 1280 });
  Object.defineProperty(recreated.window, "innerHeight", { value: 800 });
  recreated.window.HTMLCanvasElement.prototype.getContext = visible.window.HTMLCanvasElement.prototype.getContext;
  recreated.window.HTMLCanvasElement.prototype.toDataURL = () => "data:image/png;base64,test";
  let display = visible;
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const previousActFlag = globalThis.IS_REACT_ACT_ENVIRONMENT;
  globalThis.window = hidden.window;
  globalThis.document = hidden.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const globalRoot = createRoot(hidden.window.document.getElementById("globals"));
  const panelRoot = createRoot(visible.window.document.getElementById("panel"));
  let requests = 0;
  const controls = {};
  function useComposition(state, name) {
    const AddMinimumCompositionStateRequest = () => { requests++; };
    const ChangeMinimumCompositionStateRequest = () => {};
    const RemoveMinimumCompositionStateRequest = () => { requests--; };
    useEffect(() => {
      assert.equal(state, 1);
      assert.equal(name, "Round Corners", "Steam's composition log names the request");
      AddMinimumCompositionStateRequest();
      ChangeMinimumCompositionStateRequest();
      return RemoveMinimumCompositionStateRequest;
    }, [state]);
  }
  const Row = ({ children }) => React.createElement("div", {}, children);
  // Steam's composition store: focus is a subscribable value, composition a MobX observable.
  const focusListeners = new Set(), compositionListeners = new Set();
  const compositionStore = {
    m_eLatestCompositionState: 3,
    m_currentlyFocusedAppid: { Value: 769, Subscribe(callback) {
      focusListeners.add(callback);
      return { Unsubscribe: () => focusListeners.delete(callback) };
    } },
    [Symbol("mobx administration")]: { values_: new Map([["m_eLatestCompositionState", { observe_(callback) {
      compositionListeners.add(callback);
      return () => compositionListeners.delete(callback);
    } }]]) },
  };
  const steamWindow = { MainRunningApp: undefined, m_CompositionStateStore: compositionStore };
  const steam = ({ composition = compositionStore.m_eLatestCompositionState, focus, ...change }) => {
    if ("app" in change) steamWindow.MainRunningApp = change.app;
    compositionStore.m_eLatestCompositionState = composition;
    if (focus !== undefined) {
      compositionStore.m_currentlyFocusedAppid.Value = focus;
      focusListeners.forEach((listener) => listener());
    }
    compositionListeners.forEach((listener) => listener());
  };
  const values = new Map();
  hidden.window.__DECKY_SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED_deckyLoaderAPIInit = {
    connect: () => ({ _version: 2, routerHook: {
      addGlobalComponent: (_name, component) => globalRoot.render(React.createElement(component)),
      removeGlobalComponent: () => globalRoot.unmount(),
    } }),
  };
  Object.defineProperty(hidden.window, "localStorage", { value: {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  } });
  const context = vm.createContext({
    window: hidden.window, document: hidden.window.document, console, setTimeout, clearTimeout,
    SP_REACT: React, SP_REACTDOM: ReactDOM, SP_JSX: JSX,
    DFL: {
      findSP: () => display.window,
      findModuleExport: (predicate) => predicate(useComposition) ? useComposition : undefined,
      staticClasses: {}, PanelSection: Row, PanelSectionRow: Row,
      Router: { WindowStore: { GamepadUIMainWindowInstance: steamWindow } },
      // Like Steam, an unused module names the popin classes first.
      classMap: [{ VolumePopin: "unused", VolumePopinHidden: "unused-hidden" }, { VolumePopin: "popin", VolumePopinHidden: "popin-hidden" }],
      ToggleField: (props) => {
        controls[props.label === "16:9 game" ? "letterbox" : "toggle"] = props;
        return React.createElement("div", { "data-toggle": props.label });
      },
      SliderField: (props) => { controls[props.label === "Corner radius" ? "radius" : "shape"] = props; return null; },
      ButtonItem: (props) => { controls.reset = props; return null; },
    },
  });
  let plugin;
  try {
    const bundle = await readFile(new URL("../dist/index.js", import.meta.url), "utf8");
    vm.runInContext(bundle.replace("export { index as default };", "globalThis.makePlugin = index;"), context);
    await act(() => {
      plugin = context.makePlugin();
      panelRoot.render(plugin.content);
    });
    const wait = (ms) => act(() => new Promise((resolve) => setTimeout(resolve, ms)));
    const overlays = () => visible.window.document.querySelectorAll("[data-round-corners]").length;
    const opacity = () => [...new Set([...visible.window.document.querySelectorAll("[data-round-corners] img")]
      .map((corner) => corner.style.opacity))].join();
    assert.equal(overlays(), 0);
    await act(() => controls.toggle.onChange(true));
    const surface = visible.window.document.querySelector("[data-round-corners]");
    assert.ok(surface, "overlay must attach to the visible SP document");
    assert.equal(hidden.window.document.querySelectorAll("[data-round-corners]").length, 0);
    assert.equal(surface.querySelectorAll("img").length, 4);
    assert.equal(textureCreations, 1, "all four corners share one texture");
    assert.equal(surface.style.pointerEvents, "none");
    assert.equal(requests, 0, "without a game Steam's window is visible by itself, so nothing is requested");
    assert.equal(opacity(), "0", "corners start transparent");
    await wait(60);
    assert.equal(opacity(), "1", "and fade in");
    assert.equal(surface.querySelector("img").style.transition, "opacity 400ms ease-out");
    const popin = visible.window.document.querySelector(".popin");
    const cornerOpacities = () => [...surface.querySelectorAll("img")].map((corner) => corner.style.opacity);
    await act(async () => { popin.classList.remove("popin-hidden"); await Promise.resolve(); });
    assert.deepEqual(cornerOpacities(), ["0", "1", "1", "1"], "the top-left corner steps aside for the volume popin");
    assert.equal(surface.querySelector("img").style.transition, "opacity 220ms ease-out", "as fast as the popin slides in");
    await act(async () => { popin.classList.add("popin-hidden"); await Promise.resolve(); });
    assert.deepEqual(cornerOpacities(), ["1", "1", "1", "1"]);
    assert.equal(controls.radius.max, 40, "a 40-pixel header at UI scale 1 leaves room for 40");
    await act(() => controls.radius.onChange(36));
    assert.equal(surface.querySelector("img").style.width, "36px");
    assert.equal(textureCreations, 2, "texture changes only when its pixel radius changes");
    visible.window.innerWidth = 854;
    visible.window.innerHeight = 534;
    visible.window.devicePixelRatio = 1.5;
    await act(() => visible.window.dispatchEvent(new visible.window.Event("resize")));
    assert.ok(Math.abs(parseFloat(surface.querySelector("img").style.width) * 1.5 - 36) < 1e-8);
    assert.equal(textureCreations, 2, "DPR resize reuses a texture with the same physical radius");
    await act(() => controls.shape.onChange(75));
    assert.equal(textureCreations, 3, "shape updates the shared texture");
    assert.equal(controls.radius.value, 36, "shape changes leave the radius setting alone");
    assert.equal(controls.shape.value, 75);
    assert.equal(controls.radius.max, 60, "the Deck's default scale 1.5 leaves room for 60");
    await act(() => controls.radius.onChange(96));
    assert.equal(surface.querySelector("img").style.width, "40px", "drawn at 60 physical pixels");
    assert.equal(controls.radius.value, 60);
    visible.window.innerWidth = 640;
    visible.window.innerHeight = 400;
    visible.window.devicePixelRatio = 2;
    await act(() => visible.window.dispatchEvent(new visible.window.Event("resize")));
    assert.equal(surface.querySelector("img").style.width, "40px", "a larger scale allows 80 physical pixels of the saved 96");
    visible.window.innerWidth = 854;
    visible.window.innerHeight = 534;
    visible.window.devicePixelRatio = 1.5;
    await act(() => visible.window.dispatchEvent(new visible.window.Event("resize")));
    await act(() => controls.radius.onChange(0));
    assert.equal(overlays(), 1, "radius zero fades the corners out first");
    assert.equal(opacity(), "0");
    assert.equal(surface.querySelector("img").style.width, "40px", "at the last visible radius");
    await wait(450);
    assert.equal(overlays(), 0);
    await act(() => controls.radius.onChange(24));
    assert.equal(visible.window.document.querySelector("[data-round-corners] img").style.width, "16px");
    const toggleShown = () => Boolean(visible.window.document.querySelector('[data-toggle="16:9 game"]'));
    const insets = () => [...visible.window.document.querySelectorAll("[data-round-corners] img")]
      .map((corner) => Math.round(parseFloat(corner.style.top || corner.style.bottom) * 1.5 * 1e6) / 1e6);
    assert.equal(toggleShown(), false, "the 16:9 toggle needs a running game");
    const game = { appid: 367520, display_name: "Hollow Knight" };
    await act(() => steam({ app: game, composition: 0 }));
    assert.equal(opacity(), "0", "nothing is drawn while Steam's window is hidden");
    assert.equal(toggleShown(), true);
    assert.match(controls.letterbox.description, /Hollow Knight/);
    await act(() => controls.letterbox.onChange(true));
    assert.deepEqual(insets(), [0, 0, 0, 0], "a launching game without focus keeps the screen corners");
    await act(() => steam({ focus: 367520 }));
    assert.deepEqual(insets(), [40, 40, 40, 40], "corners move to the 16:9 picture's 40-pixel bars");
    assert.equal(requests, 0, "the request waits until Steam's exit animations are over");
    await wait(450);
    assert.equal(requests, 1);
    await act(() => steam({ composition: 1 }));
    assert.equal(opacity(), "1", "corners fade in once Steam's window is shown again");
    await act(() => steam({ composition: 2 }));
    assert.deepEqual(insets(), [0, 0, 0, 0], "a menu moves them back in the same frame, before focus changes");
    assert.equal(requests, 0, "the menu shows Steam's window by itself");
    await act(() => steam({ focus: 769 }));
    await act(() => steam({ composition: 0 }));
    assert.equal(opacity(), "0", "closing the menu hides Steam's window at once, as without the plugin");
    await act(() => steam({ focus: 367520 }));
    assert.equal(requests, 0);
    await wait(450);
    assert.equal(requests, 1);
    await act(() => steam({ composition: 1 }));
    assert.deepEqual(insets(), [40, 40, 40, 40]);
    await act(() => steam({ composition: 3 }));
    assert.deepEqual(insets(), [0, 0, 0, 0], "the library over the game uses the screen corners");
    assert.equal(requests, 0);
    await act(() => steam({ composition: 0 }));
    await wait(450);
    await act(() => steam({ composition: 1 }));
    await act(() => controls.letterbox.onChange(false));
    assert.deepEqual(insets(), [0, 0, 0, 0]);
    await act(() => controls.letterbox.onChange(true));
    await act(() => controls.reset.onClick());
    assert.equal(controls.letterbox.checked, true, "resetting the look keeps the 16:9 games");
    assert.equal(opacity(), "0", "turning the corners off fades them out");
    assert.equal(requests, 1, "and keeps Steam's window shown until the fade ends");
    await wait(450);
    assert.equal(requests, 0);
    assert.equal(overlays(), 0);
    await act(() => controls.toggle.onChange(true));
    await act(() => controls.radius.onChange(24));
    assert.deepEqual(insets(), [40, 40, 40, 40]);
    await wait(450);
    assert.equal(requests, 1);
    await act(() => steam({ app: undefined, composition: 3, focus: 769 }));
    assert.equal(toggleShown(), false);
    assert.deepEqual(insets(), [0, 0, 0, 0]);
    assert.equal(requests, 0);
    display = recreated;
    await act(() => controls.shape.onChange(10));
    assert.equal(visible.window.document.querySelectorAll("[data-round-corners]").length, 0);
    assert.equal(recreated.window.document.querySelector("[data-round-corners] img").style.width, "24px",
      "a recreated SP window is measured instead of reusing the old size");
    await act(() => plugin.onDismount());
    assert.equal(requests, 0);
    assert.match(visible.window.document.getElementById("panel").textContent, /reloaded/,
      "a panel Decky keeps showing after a reload stops offering stale controls");
    assert.equal(focusListeners.size, 1, "only the panel Decky still shows follows focus");
    assert.equal(compositionListeners.size, 1);
    assert.equal(recreated.window.document.querySelectorAll("[data-round-corners]").length, 0);
    assert.equal(JSON.parse(values.get("decky-round-corners:v1")).shape, 10, "unloading saves pending settings");
    assert.deepEqual(JSON.parse(values.get("decky-round-corners:v1")).letterboxApps, [367520]);
  } finally {
    await act(() => { globalRoot.unmount(); panelRoot.unmount(); });
    hidden.window.close();
    visible.window.close();
    recreated.window.close();
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
    globalThis.IS_REACT_ACT_ENVIRONMENT = previousActFlag;
  }
});
