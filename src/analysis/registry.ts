import type { HashFunction } from "../hash/types";
import type { Sharder } from "../sharder";
import { ModuloSharder } from "../strategies/modulo";

export interface StrategyFactory {
  /** Short label distinguishing this factory in tables (e.g. "vnode-ring (150)"). Usually matches the produced Sharder's `.name`. */
  label: string;
  create(hashFn: HashFunction): Sharder;
}

/**
 * Every strategy the comparison harness sweeps over. Deliberately just an
 * array literal in one place — as strategies 2 and 3 get built, adding
 * them here is the only change every experiment module needs to become
 * comparative instead of modulo-only.
 */
export const STRATEGY_FACTORIES: readonly StrategyFactory[] = [
  { label: "modulo", create: (hashFn) => new ModuloSharder(hashFn) },
];
