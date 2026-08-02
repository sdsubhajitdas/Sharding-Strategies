import os from "node:os";

export interface BenchResult {
  opsPerSec: number;
  meanNs: number;
  iterations: number;
}

export interface BenchOptions {
  warmupIters?: number;
  measureIters?: number;
}

/**
 * Runs `fn` for `warmupIters` iterations (discarded — lets the JIT warm
 * up so the measured window reflects steady-state performance, not
 * interpretation/compilation overhead), then times `measureIters`
 * iterations with `Bun.nanoseconds()`.
 */
export function benchmark(fn: (i: number) => void, options: BenchOptions = {}): BenchResult {
  const warmupIters = options.warmupIters ?? 10_000;
  const measureIters = options.measureIters ?? 200_000;

  for (let i = 0; i < warmupIters; i++) fn(i);

  const startNs = Bun.nanoseconds();
  for (let i = 0; i < measureIters; i++) fn(i);
  const elapsedNs = Bun.nanoseconds() - startNs;

  return {
    opsPerSec: measureIters / (elapsedNs / 1e9),
    meanNs: elapsedNs / measureIters,
    iterations: measureIters,
  };
}

export function printMethodology(): void {
  const cpus = os.cpus();
  console.log("Methodology: warmup iterations run first and are discarded (lets the JIT reach");
  console.log("steady state before the measured window); the measured window is timed with");
  console.log("Bun.nanoseconds(); ops/sec = measured iterations / measured seconds.\n");
  console.log(`Machine: ${os.platform()} ${os.release()} (${os.arch()}), ${cpus[0]?.model ?? "unknown CPU"} x${cpus.length}, Bun ${Bun.version}\n`);
}
