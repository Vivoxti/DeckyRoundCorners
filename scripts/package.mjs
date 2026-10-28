import { readFile, mkdir, writeFile } from "node:fs/promises";
import { zipSync, strToU8 } from "fflate";

const metadata = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const files = {};
for (const path of ["plugin.json", "dist/index.js", "dist/index.js.map", "README.md", "LICENSE"]) {
  files[`RoundCorners/${path}`] = new Uint8Array(await readFile(new URL(`../${path}`, import.meta.url)));
}
// Decky reads the version and module type from this file; no dependencies ship.
files["RoundCorners/package.json"] = strToU8(JSON.stringify({
  name: metadata.name, version: metadata.version, type: "module", license: metadata.license,
}, null, 2));
const output = new URL(`../out/RoundCorners-${metadata.version}.zip`, import.meta.url);
await mkdir(new URL("../out/", import.meta.url), { recursive: true });
await writeFile(output, zipSync(files));
console.log(`Created ${output.pathname}`);
