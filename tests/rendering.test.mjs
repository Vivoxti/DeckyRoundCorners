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
  const visible = new JSDOM('<title>SP</title><div id="panel"></div>');
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
  const recreated = new JSDOM('<title>SP</title>');
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
  function useComposition(state) {
    const AddMinimumCompositionStateRequest = () => { requests++; };
    const ChangeMinimumCompositionStateRequest = () => {};
    const RemoveMinimumCompositionStateRequest = () => { requests--; };
    useEffect(() => {
      assert.equal(state, 1);
      AddMinimumCompositionStateRequest();
      ChangeMinimumCompositionStateRequest();
      return RemoveMinimumCompositionStateRequest;
    }, [state]);
  }
  const Row = ({ children }) => React.createElement("div", {}, children);
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
      ToggleField: (props) => { controls.toggle = props; return null; },
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
    assert.equal(visible.window.document.querySelectorAll("[data-round-corners]").length, 0);
    await act(() => controls.toggle.onChange(true));
    const surface = visible.window.document.querySelector("[data-round-corners]");
    assert.ok(surface, "overlay must attach to the visible SP document");
    assert.equal(hidden.window.document.querySelectorAll("[data-round-corners]").length, 0);
    assert.equal(surface.querySelectorAll("img").length, 4);
    assert.equal(textureCreations, 1, "all four corners share one texture");
    assert.equal(surface.style.pointerEvents, "none");
    assert.equal(requests, 1);
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
    assert.equal(visible.window.document.querySelectorAll("[data-round-corners]").length, 0);
    assert.equal(requests, 0);
    await act(() => controls.radius.onChange(24));
    assert.equal(requests, 1);
    assert.equal(visible.window.document.querySelector("[data-round-corners] img").style.width, "16px");
    display = recreated;
    await act(() => controls.shape.onChange(10));
    assert.equal(visible.window.document.querySelectorAll("[data-round-corners]").length, 0);
    assert.equal(recreated.window.document.querySelector("[data-round-corners] img").style.width, "24px",
      "a recreated SP window is measured instead of reusing the old size");
    await act(() => plugin.onDismount());
    assert.equal(requests, 0);
    assert.equal(recreated.window.document.querySelectorAll("[data-round-corners]").length, 0);
    assert.equal(JSON.parse(values.get("decky-round-corners:v1")).shape, 10, "unloading saves pending settings");
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
