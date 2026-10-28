import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

// A host stub exercises the real built module. It cannot emulate Steam's
// compositor, React effects, input delivery or device power behavior.
async function loadPlugin({ compatible = true } = {}) {
  let overlay, removed;
  const values = new Map();
  const compositionStates = [];
  const visibleBody = { name: "visible SP body" };
  const display = {
    innerWidth: 854, innerHeight: 534, devicePixelRatio: 1.5,
    addEventListener() {}, removeEventListener() {},
    document: { body: visibleBody, createElement: () => ({
      getContext: () => ({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {} }),
      toDataURL: () => "data:image/png;base64,test",
    }) },
  };
  let portalTarget;
  const jsx = (type, props) => ({ type, props });
  function composition(state, name) {
    // Discovery markers from Steam's internal hook:
    // AddMinimumCompositionStateRequest ChangeMinimumCompositionStateRequest RemoveMinimumCompositionStateRequest
    compositionStates.push([state, name]);
  }
  const context = vm.createContext({
    console, setTimeout, clearTimeout,
    document: { body: {} },
    window: {
      localStorage: { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) },
      __DECKY_SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED_deckyLoaderAPIInit: {
        connect: () => ({ _version: 2, routerHook: {
          addGlobalComponent: (_name, component) => { overlay = component; },
          removeGlobalComponent: (name) => { removed = name; },
        } }),
      },
    },
    SP_REACT: { Component: class {},
      useState: (initial) => [typeof initial === "function" ? initial() : initial, () => {}],
      useEffect() {}, useMemo: (create) => create(), useRef: (current) => ({ current }),
      useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot() },
    SP_JSX: { jsx, jsxs: jsx, Fragment: "fragment" },
    SP_REACTDOM: { createPortal: (children, target) => { portalTarget = target; return children; } },
    DFL: {
      findSP: () => display,
      findModuleExport: (predicate) => compatible && predicate(composition) ? composition : undefined,
      staticClasses: {}, PanelSection: "section", PanelSectionRow: "row",
      ToggleField: "toggle", SliderField: "slider", ButtonItem: "button",
    },
  });
  const bundle = await readFile(new URL("../dist/index.js", import.meta.url), "utf8");
  // The replacement below relies on Rollup emitting exactly this default export.
  assert.match(bundle, /export \{ index as default \};/);
  vm.runInContext(bundle.replace("export { index as default };", "globalThis.makePlugin = index;"), context);
  const plugin = context.makePlugin();
  return { plugin, getOverlay: () => overlay(), compositionStates, getRemoved: () => removed, visibleBody, getPortalTarget: () => portalTarget };
}

test("built plugin registers, updates all four corners, hides at zero and unloads", async () => {
  const host = await loadPlugin();
  assert.equal(host.getOverlay(), null);
  const panel = host.plugin.content.type();
  const toggle = panel.props.children[0].props.children;
  const slider = panel.props.children[1].props.children;
  const shape = panel.props.children[2].props.children;
  toggle.props.onChange(true);
  slider.props.onChange(48);
  shape.props.onChange(-50);
  const boundary = host.getOverlay();
  const surface = boundary.props.children;
  assert.equal(surface.props.shape, -50);
  assert.equal(surface.props.radius, 48);
  const graphics = surface.type(surface.props);
  // Without Steam's composition store the request is held all the time.
  const [request] = graphics.props.children;
  assert.equal(request.type(request.props), null);
  assert.deepEqual(host.compositionStates, [[1, "Round Corners"]]);
  assert.equal(host.getPortalTarget(), host.visibleBody);
  const corners = graphics.props.children.at(-1);
  assert.equal(corners.length, 4);
  for (const corner of corners) {
    assert.equal(corner.props.style.width, 32);
    assert.equal(corner.props.style.height, 32);
    assert.equal(corner.props.style.pointerEvents, "none");
    assert.equal(corner.type, "img");
    assert.equal(corner.props.style.imageRendering, "pixelated");
    assert.match(corner.props.src, /^data:image\/png/);
  }
  slider.props.onChange(0);
  assert.equal(host.getOverlay(), null);
  slider.props.onChange(24);
  toggle.props.onChange(false);
  assert.equal(host.getOverlay(), null);
  host.plugin.onDismount();
  assert.equal(host.getRemoved(), "DeckyRoundCorners.Overlay");
});

test("an unsupported Steam API leaves the effect unavailable", async () => {
  const host = await loadPlugin({ compatible: false });
  const panel = host.plugin.content.type();
  const toggle = panel.props.children[0].props.children;
  assert.equal(toggle.props.disabled, true);
  toggle.props.onChange(true);
  assert.equal(host.getOverlay(), null);
  assert.equal(host.compositionStates.length, 0);
});
