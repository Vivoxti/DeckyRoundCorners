#!/usr/bin/env bash
# Runs on the Deck: ssh deck@IP 'bash -s' -- SECONDS < scripts/perf-sample.sh > run.csv
# One CSV row per second, read-only sysfs/procfs access. Missing sources stay empty.
# PERF_SYSFS_ROOT points at a fake /sys tree for local testing.
set -u
seconds=${1:-240}
sys=${PERF_SYSFS_ROOT:-}/sys
bat=$sys/class/power_supply/BAT1
hwmon=""
for h in "$sys"/class/hwmon/hwmon*; do
  [ "$(cat "$h/name" 2>/dev/null)" = amdgpu ] && hwmon=$h && break
done
gpu=""
for c in "$sys"/class/drm/card*/device; do
  [ -r "$c/gpu_busy_percent" ] && gpu=$c && break
done
ticks=$(getconf CLK_TCK 2>/dev/null || echo 100)

value() { cat "$1" 2>/dev/null; }
battery_watts() {
  local power current voltage
  power=$(value "$bat/power_now")
  if [ -n "$power" ]; then awk -v p="$power" 'BEGIN { printf "%.3f", p / 1e6 }'; return; fi
  current=$(value "$bat/current_now"); voltage=$(value "$bat/voltage_now")
  [ -n "$current" ] && [ -n "$voltage" ] && awk -v i="$current" -v v="$voltage" 'BEGIN { printf "%.3f", i * v / 1e12 }'
}
apu_watts() {
  [ -n "$hwmon" ] || return
  local power
  power=$(value "$hwmon/power1_average"); [ -n "$power" ] || power=$(value "$hwmon/power1_input")
  [ -n "$power" ] && awk -v p="$power" 'BEGIN { printf "%.3f", p / 1e6 }'
}
gpu_mhz() {
  [ -n "$gpu" ] && awk '/\*/ { gsub(/[^0-9]/, "", $2); print $2; exit }' "$gpu/pp_dpm_sclk" 2>/dev/null
}
# CPU ticks: whole system (busy, total), then steamwebhelper and gamescope processes.
cpu_ticks() {
  local busy
  busy=$(awk '/^cpu / { idle = $5 + $6; total = 0; for (i = 2; i <= NF; i++) total += $i; print total - idle, total }' /proc/stat 2>/dev/null)
  cat /proc/[0-9]*/stat 2>/dev/null | awk -v busy="$busy" '
    { lp = index($0, "("); rp = 0
      for (i = length($0); i > 0; i--) if (substr($0, i, 1) == ")") { rp = i; break }
      comm = substr($0, lp + 1, rp - lp - 1)
      split(substr($0, rp + 2), f, " ")
      if (comm ~ /^steamwebhelper/) web += f[12] + f[13]
      else if (comm ~ /^gamescope/) scope += f[12] + f[13] }
    END { print (busy == "" ? "0 0" : busy), web + 0, scope + 0 }'
}

echo "t,charging,battery_w,apu_w,gpu_busy,gpu_mhz,cpu_total,webhelper_cpu,gamescope_cpu"
read -r busy0 total0 web0 scope0 <<< "$(cpu_ticks)"
start=$(date +%s.%N); last=$start
for ((i = 1; i <= seconds; i++)); do
  sleep 1
  now=$(date +%s.%N)
  read -r busy1 total1 web1 scope1 <<< "$(cpu_ticks)"
  status=$(value "$bat/status")
  charging=0; [ "$status" = Charging ] || [ "$status" = Full ] && charging=1
  awk -v t="$now" -v s="$start" -v l="$last" -v hz="$ticks" -v c="$charging" \
    -v bw="$(battery_watts)" -v aw="$(apu_watts)" -v gb="$(value "${gpu:-/nonexistent}/gpu_busy_percent")" -v gm="$(gpu_mhz)" \
    -v b0="$busy0" -v b1="$busy1" -v t0="$total0" -v t1="$total1" -v w0="$web0" -v w1="$web1" -v g0="$scope0" -v g1="$scope1" \
    'BEGIN { dt = t - l; total = t1 - t0
      printf "%.1f,%s,%s,%s,%s,%s,%s,%.1f,%.1f\n", t - s, c, bw, aw, gb, gm,
        (total > 0 ? sprintf("%.1f", 100 * (b1 - b0) / total) : ""),
        100 * (w1 - w0) / hz / dt, 100 * (g1 - g0) / hz / dt }'
  busy0=$busy1; total0=$total1; web0=$web1; scope0=$scope1; last=$now
done
