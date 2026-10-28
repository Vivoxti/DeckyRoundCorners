import test from "node:test";
import assert from "node:assert/strict";
import { compareRuns, parseCsv, summarizeRun } from "../scripts/perf-stats.mjs";

const HEADER = "t,charging,battery_w,apu_w,gpu_busy,gpu_mhz,cpu_total,webhelper_cpu,gamescope_cpu";
const csv = (watts, { charging = 0, settle = 99 } = {}) => [HEADER,
  ...Array.from({ length: 60 }, (_, index) => {
    const t = index + 1;
    // The first seconds after switching are noisy and must not count.
    return `${t},${charging},${t < 20 ? settle : watts},6,30,1100,20,1.5,`;
  })].join("\n");

test("runs ignore the settling seconds and missing sources", () => {
  const summary = summarizeRun(parseCsv(csv(10)), 20);
  assert.equal(summary.samples, 41);
  assert.equal(summary.means.battery_w, 10);
  assert.ok(Number.isNaN(summary.means.gamescope_cpu));
  assert.equal(summary.charging, false);
  assert.equal(summarizeRun(parseCsv(csv(10, { charging: 1 })), 20).charging, true);
});

test("a difference counts only when it exceeds the spread between repeated runs", () => {
  const run = (label, watts) => ({ label, ...summarizeRun(parseCsv(csv(watts)), 20) });
  const watts = (runs) => compareRuns(runs).find((row) => row.key === "battery_w");
  const noisy = watts([run("off", 10), run("on", 10.2), run("off", 10.3), run("on", 10.1), run("off", 9.9)]);
  assert.equal(noisy.verdict, "within noise");
  assert.ok(Math.abs(noisy.noise - 0.4) < 1e-9);
  const real = watts([run("off", 10), run("on", 10.8), run("off", 10.1), run("on", 10.9), run("off", 10.05)]);
  assert.equal(real.verdict, "above noise");
  assert.ok(Math.abs(real.difference - (10.85 - 10.05)) < 1e-9);
  assert.equal(watts([run("off", 10), run("on", 11)]).verdict, "too few runs");
});
