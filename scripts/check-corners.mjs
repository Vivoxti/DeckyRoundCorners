// Temporarily overlays a white test background, captures corners, then restores
// the live plugin. No settings or files are changed on the Deck.
// Usage: node scripts/check-corners.mjs http://DECK_IP:8081 [--shapes]
import { mkdir, writeFile } from "node:fs/promises";
import { PNG } from "pngjs";
import { connectCEF } from "./cdp.mjs";
import { createCornerPixels, getCornerGeometry, CORNER_POSITIONS } from "../src/geometry.mjs";
const base = process.argv[2];
if (!base) throw new Error("Pass the Deck CEF URL");
const radii = [8, 12, 16, 20, 24, 31, 32, 48, 59, 60];
const checkShapes = process.argv.includes("--shapes");
const cdp = await connectCEF(base, "Steam Big Picture Mode");
const output = new URL("../out/corner-qa/", import.meta.url);
await mkdir(output, { recursive: true });
const measurements = [];
try {
  const info = await cdp.evaluate(() => ({
    viewport: [innerWidth, innerHeight], dpr: devicePixelRatio,
    screen: [screen.width, screen.height],
    visualViewport: { width: visualViewport.width, height: visualViewport.height, scale: visualViewport.scale },
  }));
  console.log(JSON.stringify(info));
  await cdp.evaluate(() => {
    if (document.getElementById("round-corners-qa")) throw Error("QA already active");
    const original = document.querySelector("[data-round-corners]");
    if (!original) throw Error("Enable Round Corners first");
    const test = original.cloneNode(false);
    test.id = "round-corners-qa";
    test.dataset.originalVisibility = original.style.visibility;
    test.style.background = "#fff";
    test.style.visibility = "visible";
    original.style.visibility = "hidden";
    document.body.appendChild(test);
  });
  const cases = checkShapes
    ? [24, 48, 60].flatMap((radius) => [-100, -50, 0, 50, 100].map((shape) => ({ radius, shape })))
    : radii.map((radius) => ({ radius, shape: 0 }));
  for (const { radius, shape } of cases) {
    const { physicalRadius, cssSize } = getCornerGeometry(radius, info.viewport[0], info.viewport[1], info.dpr);
    const reference = new PNG({ width: physicalRadius, height: physicalRadius });
    reference.data = Buffer.from(createCornerPixels(physicalRadius, shape));
    const texture = `data:image/png;base64,${PNG.sync.write(reference).toString("base64")}`;
    const geometry = await cdp.evaluate(async (texture, cssSize, positions) => {
      const root = document.getElementById("round-corners-qa");
      root.querySelectorAll("img").forEach((node) => node.remove());
      for (const position of positions) {
        const img = document.createElement("img");
        Object.assign(img.style, position, { position: "fixed", width: `${cssSize}px`, height: `${cssSize}px`, pointerEvents: "none", imageRendering: "pixelated" });
        img.src = texture;
        root.appendChild(img);
        await img.decode();
      }
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return [...root.querySelectorAll("img")].map((node) => node.getBoundingClientRect().toJSON());
    }, texture, cssSize, CORNER_POSITIONS);
    const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
    const data = Buffer.from(shot.data, "base64");
    await writeFile(new URL(checkShapes ? `shape-${shape}-${radius}.png` : `radius-${radius}.png`, output), data);
    const png = PNG.sync.read(data);
    const extent = Math.min(radius + 8, Math.floor(png.width / 2), Math.floor(png.height / 2));
    const value = (corner, x, y) => {
      const px = corner === 1 || corner === 2 ? png.width - 1 - x : x;
      const py = corner === 2 || corner === 3 ? png.height - 1 - y : y;
      return png.data[(py * png.width + px) * 4];
    };
    let maxDifference = 0;
    for (let corner = 1; corner < 4; corner++) for (let y = 0; y < extent; y++) for (let x = 0; x < extent; x++) {
      maxDifference = Math.max(maxDifference, Math.abs(value(corner, x, y) - value(0, x, y)));
    }
    let referenceError = 0;
    for (let y = 0; y < physicalRadius; y++) for (let x = 0; x < physicalRadius; x++) {
      referenceError = Math.max(referenceError, Math.abs(value(0, x, y) - (255 - reference.data[(y * physicalRadius + x) * 4 + 3])));
    }
    measurements.push({ radius, shape, physicalRadius, image: [png.width, png.height], geometry, maxDifference, referenceError });
    console.log(JSON.stringify({ radius, shape, physicalRadius, maxDifference, referenceError }));
  }
  await writeFile(new URL(checkShapes ? "shape-measurements.json" : "measurements.json", output), JSON.stringify({ info, measurements }, null, 2));
  if (measurements.some((row) => row.maxDifference || row.referenceError)) throw Error("Corner rendering did not match its reference mask");
} finally {
  await cdp.evaluate(() => {
    const test = document.getElementById("round-corners-qa");
    if (!test) return;
    const original = [...document.querySelectorAll("[data-round-corners]")].find((node) => node !== test);
    if (original) original.style.visibility = test.dataset.originalVisibility;
    test.remove();
  });
  cdp.close();
}
