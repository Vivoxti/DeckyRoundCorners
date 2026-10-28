import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { compareRuns, parseCsv, summarizeRun } from "./perf-stats.mjs";

/** Prints the on/off comparison for a directory of off-N.csv and on-N.csv files.
 * @param {string} directory @param {number} [skipSeconds]
 */
export async function printComparison(directory, skipSeconds = 20) {
  const names = (await readdir(directory)).filter((name) => /^(on|off)-\d+\.csv$/.test(name)).sort();
  if (!names.length) throw Error(`No on-N.csv / off-N.csv files in ${directory}`);
  const runs = [];
  for (const name of names) {
    const summary = summarizeRun(parseCsv(await readFile(join(directory, name), "utf8")), skipSeconds);
    runs.push({ label: name.split("-")[0], ...summary });
    const warning = summary.charging ? "  WARNING: the Deck was charging, watts are unreliable" : "";
    console.log(`${name}: ${summary.samples} s, Deck ${summary.means.battery_w.toFixed(2)} W${warning}`);
  }
  console.log();
  const rows = compareRuns(runs).map((row) => ({
    "Metric": row.label,
    "Off": row.offMean.toFixed(row.digits),
    "On": row.onMean.toFixed(row.digits),
    "Difference": (row.difference >= 0 ? "+" : "") + row.difference.toFixed(row.digits),
    "Noise": row.noise.toFixed(row.digits),
    "Verdict": row.verdict,
  }));
  console.table(rows);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [directory, skip] = process.argv.slice(2);
  if (!directory) {
    console.error("Usage: node scripts/perf-compare.mjs out/perf/<run> [skipSeconds]");
    process.exit(1);
  }
  await printComparison(directory, skip ? Number(skip) : undefined);
}
