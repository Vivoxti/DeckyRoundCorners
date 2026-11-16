import { mkdir, writeFile } from "node:fs/promises";
import { PNG } from "pngjs";
import { createCornerPixels } from "../src/geometry.mjs";
const image = new PNG({ width: 600, height: 166 });
for (let i = 3; i < image.data.length; i += 4) image.data[i] = 255;
const glyphs = {
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
};
for (const [index, shape] of [-100, 0, 100].entries()) {
  const mask = createCornerPixels(56, shape);
  for (let y = 0; y < 120; y++) for (let x = 0; x < 180; x++) {
    const cornerX = Math.min(x, 179 - x), cornerY = Math.min(y, 119 - y);
    const alpha = cornerX < 56 && cornerY < 56 ? mask[(cornerY * 56 + cornerX) * 4 + 3] : 0;
    const offset = ((y + 8) * image.width + index * 200 + x + 10) * 4;
    for (const [channel, color] of [80, 175, 220].entries()) image.data[offset + channel] = Math.round(color * (1 - alpha / 255));
  }
  const text = shape > 0 ? `+${shape}` : `${shape}`;
  const start = index * 200 + 100 - (text.length * 18 - 3) / 2;
  for (const [character, symbol] of [...text].entries()) for (let y = 0; y < 7; y++) for (let x = 0; x < 5; x++) {
    if (glyphs[symbol][y][x] !== "1") continue;
    for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) {
      const offset = ((y * 3 + dy + 138) * image.width + Math.round(start) + character * 18 + x * 3 + dx) * 4;
      image.data.fill(230, offset, offset + 3);
    }
  }
}
await mkdir(new URL("../out/", import.meta.url), { recursive: true });
await writeFile(new URL("../out/shape-preview.png", import.meta.url), PNG.sync.write(image));
