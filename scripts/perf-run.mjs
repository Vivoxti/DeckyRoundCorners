import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { printComparison } from "./perf-compare.mjs";
import { parseCsv } from "./perf-stats.mjs";

// Usage: node scripts/perf-run.mjs deck@IP [secondsPerPhase=180] [onPhases=3] [warmupSeconds=300]
// Alternates off/on/off/.../off; every "on" phase is surrounded by "off" phases.
const [host, phaseArg, cyclesArg, warmupArg] = process.argv.slice(2);
if (!host) {
  console.error("Usage: node scripts/perf-run.mjs deck@IP [secondsPerPhase] [onPhases] [warmupSeconds]");
  process.exit(1);
}
const phaseSeconds = Number(phaseArg ?? 180), cycles = Number(cyclesArg ?? 3), warmupSeconds = Number(warmupArg ?? 300);
const sampler = await readFile(new URL("./perf-sample.sh", import.meta.url));
const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);
const directory = new URL(`../out/perf/${stamp}/`, import.meta.url);
await mkdir(directory, { recursive: true });
const prompt = createInterface({ input: process.stdin, output: process.stdout });

/** Streams the Deck sampler's CSV into a local file. */
function record(name, seconds) {
  return new Promise((resolve, reject) => {
    const ssh = spawn("ssh", ["-o", "BatchMode=yes", "-o", "ConnectTimeout=10", host, `bash -s -- ${seconds}`],
      { stdio: ["pipe", "pipe", "inherit"] });
    const file = createWriteStream(new URL(name, directory));
    let lines = 0;
    ssh.stdout.on("data", (chunk) => {
      file.write(chunk);
      lines += chunk.toString().split("\n").length - 1;
      process.stdout.write(`\r  recording: ${Math.max(0, lines - 1)} of ${seconds} s   `);
    });
    ssh.on("error", reject);
    ssh.on("close", (code) => {
      file.end();
      process.stdout.write("\n");
      code === 0 ? resolve() : reject(Error(`ssh exited with code ${code}`));
    });
    ssh.stdin.end(sampler);
  });
}

try {
  console.log("Checking access to the Deck...");
  await record("check.csv", 2);
  const check = parseCsv(await readFile(new URL("check.csv", directory), "utf8")).at(-1) ?? {};
  const missing = ["battery_w", "apu_w", "gpu_busy"].filter((key) => !Number.isFinite(check[key]));
  if (missing.length) console.log(`  No data for: ${missing.join(", ")}. Measuring without them.`);
  if (check.charging === 1) console.log("  WARNING: the Deck is charging. Unplug it, or the watts will be unreliable.");
  console.log(`  Deck: ${check.battery_w} W, GPU ${check.gpu_busy}%`);

  await prompt.question("\nStart the game and go to the chosen scene with corners OFF. Press Enter to warm up.");
  console.log(`Warming up for ${warmupSeconds} s. Do not touch anything.`);
  await record("warmup.csv", warmupSeconds);

  const phases = Array.from({ length: cycles * 2 + 1 }, (_, index) => index % 2 ? "on" : "off");
  const counters = { on: 0, off: 0 };
  for (const [index, phase] of phases.entries()) {
    const name = `${phase}-${++counters[phase]}.csv`;
    if (index > 0) {
      await prompt.question(`\n[${index + 1}/${phases.length}] Turn corners ${phase === "on" ? "ON" : "OFF"} in QAM, `
        + "close QAM, return to the same scene and press Enter.");
    } else {
      console.log(`\n[1/${phases.length}] Corners are off.`);
    }
    console.log(`Recording for ${phaseSeconds} s. Do not touch anything.`);
    await record(name, phaseSeconds);
  }
  const path = fileURLToPath(directory);
  console.log(`\nDone. Data: ${path}\n`);
  await printComparison(path);
} catch (error) {
  console.error(`\n${error.message}`);
  console.error("If this is an access error, set up key login: ssh-keygen, then copy the key to the Deck.");
  process.exitCode = 1;
} finally {
  prompt.close();
}
