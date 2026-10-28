import { readFileSync } from "node:fs";
import deckyPlugin from "@decky/rollup";
import replace from "@rollup/plugin-replace";

// package.json stays the single source of the version shown in the UI and DOM markers.
const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

// @decky/rollup always emits a source map; it ships next to the bundle.
export default deckyPlugin({
  plugins: [replace({ preventAssignment: true, values: { __PLUGIN_VERSION__: JSON.stringify(version) } })],
});
