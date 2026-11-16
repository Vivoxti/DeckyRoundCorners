import test from "node:test";
import assert from "node:assert/strict";
import { createCornerPixels, getCornerGeometry, getShapeExponent, pixelCoverage, shapedPixelCoverage, getMaxRadius, getLetterboxInset, BAR_HEIGHT } from "../src/geometry.mjs";

test("fractional Steam UI scaling maps to whole physical pixels", () => {
  for (const dpr of [1, 1.25, 1.5, 2]) for (let radius = 1; radius <= 96; radius++) {
    const geometry = getCornerGeometry(radius, 854, 534, dpr);
    assert.ok(Number.isInteger(geometry.physicalRadius));
    assert.ok(Math.abs(geometry.cssSize * dpr - geometry.physicalRadius) < 1e-10);
  }
  assert.deepEqual(getCornerGeometry(96, 854, 534, 1.5), { physicalRadius: 96, cssSize: 64 });
  assert.equal(getCornerGeometry(0, 854, 534, 1.5).physicalRadius, 0);
});

test("16:9 letterbox bars are measured in physical pixels at every UI scale", () => {
  for (const [width, height, dpr] of [[1280, 800, 1], [854, 534, 1.5], [853.3333, 533.3333, 1.5], [640, 400, 2]]) {
    assert.equal(getLetterboxInset(width, height, dpr), 40, "the Deck's 1280×800 leaves 40-pixel bars around 1280×720");
  }
  assert.equal(getLetterboxInset(1920, 1080, 1), 0, "a 16:9 screen has no bars");
  assert.equal(getLetterboxInset(2560, 1080, 1), 0, "a wider screen has side bars, not top and bottom ones");
  assert.equal(getLetterboxInset(1920, 1200, 1), 60);
});

test("shape changes bend the curve while keeping symmetric and monotone pixel coverage", () => {
  assert.equal(getShapeExponent(-100), 1.25);
  assert.equal(getShapeExponent(0), 2);
  assert.equal(getShapeExponent(100), 8);
  for (const radius of [1, 8, 24, 31, 96]) {
    let previousArea = Infinity;
    for (const shape of [-100, -50, 0, 1, 50, 100]) {
      const pixels = createCornerPixels(radius, shape);
      assert.equal(pixels.length, radius * radius * 4);
      const alpha = (x, y) => pixels[(y * radius + x) * 4 + 3];
      let area = 0;
      for (let y = 0; y < radius; y++) for (let x = 0; x < radius; x++) {
        assert.equal(alpha(x, y), alpha(y, x));
        if (x) assert.ok(alpha(x, y) <= alpha(x - 1, y));
        if (y) assert.ok(alpha(x, y) <= alpha(x, y - 1));
        if (shape === 0) assert.equal(alpha(x, y), pixelCoverage(x, y, radius));
        area += alpha(x, y);
      }
      assert.ok(area <= previousArea, `shape order at radius ${radius}`);
      previousArea = area;
    }
  }
});

test("shaped edge integration agrees with independent dense midpoint sampling", () => {
  const radius = 31;
  for (const shape of [-100, -50, 50, 100]) {
    const exponent = getShapeExponent(shape);
    for (const x of [0, 5, 15, 25, 30]) {
      // Locate an edge pixel at this x, then integrate along the other axis
      // using an independent fixed-step rule (no adaptive integration).
      const edge = radius * (1 - (1 - ((radius - x - 0.5) / radius) ** exponent) ** (1 / exponent));
      const y = Math.min(radius - 1, Math.max(0, Math.floor(edge)));
      let covered = 0;
      const samples = 32768;
      for (let i = 0; i < samples; i++) {
        const u = radius - x - (i + 0.5) / samples;
        const boundary = radius * Math.max(0, 1 - (u / radius) ** exponent) ** (1 / exponent);
        covered += Math.max(0, Math.min(1, radius - y - boundary));
      }
      const expected = Math.round(255 * covered / samples);
      assert.ok(Math.abs(shapedPixelCoverage(x, y, radius, exponent) - expected) <= 1, `coverage at ${shape}: ${x},${y}`);
    }
  }
});

test("every allowed radius has symmetric, monotone alpha and the correct circular area", () => {
  for (let radius = 1; radius <= 96; radius++) {
    const image = createCornerPixels(radius);
    const alpha = (x, y) => image[(y * radius + x) * 4 + 3];
    let area = 0;
    for (let y = 0; y < radius; y++) for (let x = 0; x < radius; x++) {
      assert.equal(alpha(x, y), alpha(y, x));
      if (x) assert.ok(alpha(x, y) <= alpha(x - 1, y));
      if (y) assert.ok(alpha(x, y) <= alpha(x, y - 1));
      area += alpha(x, y) / 255;
    }
    const expected = radius * radius * (1 - Math.PI / 4);
    assert.ok(Math.abs(area - expected) < radius * 2 / 255, `area mismatch at radius ${radius}`);
    // The tangent pixel is mostly clear rather than an opaque step.
    assert.ok(alpha(radius - 1, 0) < 128);
  }
});

test("analytic edge coverage agrees with independent high resolution sampling", () => {
  for (const [radius, x, y] of [[1, 0, 0], [8, 5, 0], [24, 18, 0], [31, 8, 9], [96, 86, 0], [96, 27, 28]]) {
    let outside = 0;
    const samples = 512;
    for (let sy = 0; sy < samples; sy++) for (let sx = 0; sx < samples; sx++) {
      const dx = radius - x - (sx + 0.5) / samples;
      const dy = radius - y - (sy + 0.5) / samples;
      if (dx * dx + dy * dy > radius * radius) outside++;
    }
    const expected = Math.round(255 * outside / (samples * samples));
    assert.ok(Math.abs(pixelCoverage(x, y, radius) - expected) <= 1);
  }
});

test("the radius limit keeps corners within the header and footer at every UI scale", () => {
  assert.equal(getMaxRadius(854, 1.5), 60, "the Deck's default scale, measured: 60 physical rows");
  assert.equal(getMaxRadius(1280, 1), 40);
  assert.equal(getMaxRadius(640, 2), 80);
  for (const dpr of [0.5, 1, 1.25, 1.5, 1.75, 2, 2.396]) {
    const width = 1280 / dpr, height = 800 / dpr, bar = Math.floor(BAR_HEIGHT * dpr);
    const max = getMaxRadius(width, dpr);
    assert.ok(getCornerGeometry(max, width, height, dpr).physicalRadius <= bar, `fits at scale ${dpr}`);
    assert.ok(getCornerGeometry(max + 1, width, height, dpr).physicalRadius > bar, `largest at scale ${dpr}`);
  }
});
