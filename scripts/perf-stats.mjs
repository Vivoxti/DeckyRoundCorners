export const METRICS = Object.freeze([
  { key: "battery_w", label: "Whole Deck, W", digits: 2 },
  { key: "apu_w", label: "APU, W", digits: 2 },
  { key: "gpu_busy", label: "GPU busy, %", digits: 1 },
  { key: "gpu_mhz", label: "GPU clock, MHz", digits: 0 },
  { key: "cpu_total", label: "CPU total, %", digits: 1 },
  { key: "webhelper_cpu", label: "Steam UI, % of a core", digits: 1 },
  { key: "gamescope_cpu", label: "Gamescope, % of a core", digits: 1 },
]);

/** @param {string} text */
export function parseCsv(text) {
  const [header, ...lines] = text.trim().split(/\r?\n/);
  const columns = header.split(",");
  return lines.filter(Boolean).map((line) => {
    const cells = line.split(",");
    return Object.fromEntries(columns.map((column, index) =>
      [column, cells[index] === undefined || cells[index] === "" ? NaN : Number(cells[index])]));
  });
}

const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : NaN;

/** Averages one run after dropping the seconds spent switching settings.
 * @param {Record<string, number>[]} rows @param {number} skipSeconds
 */
export function summarizeRun(rows, skipSeconds) {
  const kept = rows.filter((row) => row.t >= skipSeconds);
  return {
    samples: kept.length,
    charging: kept.some((row) => row.charging === 1),
    means: Object.fromEntries(METRICS.map(({ key }) =>
      [key, mean(kept.map((row) => row[key]).filter(Number.isFinite))])),
  };
}

/** Compares "on" runs against "off" runs. Noise is the widest spread between
 * repeated runs of the same state; a smaller difference is not a finding.
 * @param {{ label: string, means: Record<string, number> }[]} runs
 */
export function compareRuns(runs) {
  const values = (label, key) => runs.filter((run) => run.label === label)
    .map((run) => run.means[key]).filter(Number.isFinite);
  const range = (list) => list.length > 1 ? Math.max(...list) - Math.min(...list) : NaN;
  return METRICS.map((metric) => {
    const off = values("off", metric.key), on = values("on", metric.key);
    const offMean = mean(off), onMean = mean(on);
    const noise = Math.max(range(off) || 0, range(on) || 0);
    const difference = onMean - offMean;
    const measurable = off.length > 1 && on.length > 1 && Number.isFinite(difference);
    return { ...metric, offMean, onMean, difference, noise,
      verdict: !measurable ? "too few runs" : Math.abs(difference) > noise ? "above noise" : "within noise" };
  });
}
