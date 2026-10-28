/** @param {number} radius @param {number} width @param {number} height @param {number} dpr */
export function getCornerGeometry(radius, width, height, dpr) {
  const pixelRatio = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  const physicalWidth = Math.max(1, Math.round(width * pixelRatio));
  const physicalHeight = Math.max(1, Math.round(height * pixelRatio));
  const physicalRadius = radius <= 0 ? 0 : Math.max(1, Math.min(
    Math.round(radius * physicalWidth / 1280),
    Math.floor(Math.min(physicalWidth, physicalHeight) / 2),
  ));
  return { physicalRadius, cssSize: physicalRadius / pixelRatio };
}

// Steam's header and footer, in CSS pixels. The Store, Quick Access and side
// menus are native views drawn above the corners between them: measured on a
// Deck at scale 1.5, they start 40 and end 40 CSS pixels from the edges.
// Other UI scales are assumed to keep the same CSS height.
export const BAR_HEIGHT = 40;

/** Largest radius setting whose corner stays within the header and footer.
 * @param {number} width @param {number} dpr
 */
export function getMaxRadius(width, dpr) {
  const pixelRatio = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  const physicalWidth = Math.max(1, Math.round(width * pixelRatio));
  const limit = Math.floor(BAR_HEIGHT * pixelRatio);
  // round(radius * physicalWidth / 1280) <= limit  <=>  radius * physicalWidth / 1280 < limit + 0.5
  return Math.max(0, Math.ceil((limit + 0.5) * 1280 / physicalWidth) - 1);
}

// Integral of sqrt(r²-u²). Used only for pixels crossed by the circle.
function circleIntegral(u, radius) {
  return 0.5 * (u * Math.sqrt(Math.max(0, radius * radius - u * u))
    + radius * radius * Math.asin(Math.min(1, Math.max(0, u / radius))));
}

/** Exact area outside a quarter circle within one display pixel.
 * @param {number} x @param {number} y @param {number} radius
 */
export function pixelCoverage(x, y, radius) {
  const u0 = radius - x - 1, u1 = radius - x;
  const v0 = radius - y - 1, v1 = radius - y;
  const squaredRadius = radius * radius;
  if (u0 * u0 + v0 * v0 >= squaredRadius) return 255;
  if (u1 * u1 + v1 * v1 <= squaredRadius) return 0;
  const partialStart = Math.max(u0, Math.sqrt(Math.max(0, squaredRadius - v1 * v1)));
  const fullStart = Math.sqrt(Math.max(0, squaredRadius - v0 * v0));
  const partialEnd = Math.min(u1, fullStart);
  const partial = partialEnd > partialStart
    ? v1 * (partialEnd - partialStart)
      - circleIntegral(partialEnd, radius) + circleIntegral(partialStart, radius)
    : 0;
  const full = Math.max(0, u1 - Math.max(u0, fullStart));
  return Math.round(255 * Math.max(0, Math.min(1, partial + full)));
}

/** Shape zero preserves the circle; both endpoints keep tangent joins.
 * @param {number} shape
 */
export function getShapeExponent(shape) {
  const value = Number.isFinite(shape) ? Math.min(100, Math.max(-100, shape)) : 0;
  return value < 0 ? 2 * 1.6 ** (value / 100) : 2 * 4 ** (value / 100);
}

// Integrate only the part of an edge pixel crossed by the curve. An absolute
// area tolerance of 1e-6 is much smaller than one 8-bit alpha level.
function integrate(fn, a, b, tolerance = 1e-6) {
  const middle = (a + b) / 2;
  const fa = fn(a), fm = fn(middle), fb = fn(b);
  const whole = (b - a) * (fa + 4 * fm + fb) / 6;
  function refine(a, b, fa, fm, fb, estimate, tolerance, depth) {
    const middle = (a + b) / 2;
    const fl = fn((a + middle) / 2), fr = fn((middle + b) / 2);
    const left = (middle - a) * (fa + 4 * fl + fm) / 6;
    const right = (b - middle) * (fm + 4 * fr + fb) / 6;
    const delta = left + right - estimate;
    if (!depth || Math.abs(delta) <= 15 * tolerance) return left + right + delta / 15;
    return refine(a, middle, fa, fl, fm, left, tolerance / 2, depth - 1)
      + refine(middle, b, fm, fr, fb, right, tolerance / 2, depth - 1);
  }
  return refine(a, b, fa, fm, fb, whole, tolerance, 18);
}

/** Area outside a superellipse, with a fixed radius-sized bounding square.
 * @param {number} x @param {number} y @param {number} radius @param {number} exponent
 */
export function shapedPixelCoverage(x, y, radius, exponent) {
  const u0 = radius - x - 1, u1 = radius - x;
  const v0 = radius - y - 1, v1 = radius - y;
  const distance = (u, v) => (u / radius) ** exponent + (v / radius) ** exponent;
  if (distance(u0, v0) >= 1) return 255;
  if (distance(u1, v1) <= 1) return 0;
  const boundary = (u) => radius * Math.max(0, 1 - (u / radius) ** exponent) ** (1 / exponent);
  const partialStart = Math.max(u0, boundary(v1));
  const fullStart = boundary(v0);
  const partialEnd = Math.min(u1, fullStart);
  const partial = partialEnd > partialStart
    ? integrate((u) => v1 - boundary(u), partialStart, partialEnd) : 0;
  const full = Math.max(0, u1 - Math.max(u0, fullStart));
  return Math.round(255 * Math.max(0, Math.min(1, partial + full)));
}

/** Black RGBA image with area-coverage antialiasing, computed on settings changes.
 * @param {number} radius @param {number} [shape]
 */
export function createCornerPixels(radius, shape = 0) {
  const pixels = new Uint8ClampedArray(radius * radius * 4);
  const exponent = getShapeExponent(shape);
  for (let y = 0; y < radius; y++) for (let x = y; x < radius; x++) {
    const alpha = exponent === 2 ? pixelCoverage(x, y, radius) : shapedPixelCoverage(x, y, radius, exponent);
    pixels[(y * radius + x) * 4 + 3] = alpha;
    pixels[(x * radius + y) * 4 + 3] = alpha;
  }
  return pixels;
}

/** @param {Document} document @param {number} radius @param {number} [shape] */
export function createCornerTexture(document, radius, shape = 0) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = radius;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Corner texture canvas is unavailable");
  const image = context.createImageData(radius, radius);
  image.data.set(createCornerPixels(radius, shape));
  context.putImageData(image, 0, 0);
  return canvas.toDataURL("image/png");
}

export const CORNER_POSITIONS = Object.freeze([
  { top: 0, left: 0 },
  { top: 0, right: 0, transform: "scaleX(-1)" },
  { bottom: 0, right: 0, transform: "scale(-1, -1)" },
  { bottom: 0, left: 0, transform: "scaleY(-1)" },
]);
