import { printMethodology } from "./harness";
import { runStrategyComparison, runVnodeSweep as runLookupVnodeSweep } from "./lookup-throughput";
import { runBuildTimeSweep } from "./build-time";
import { printTable } from "../src/analysis/print-table";

printMethodology();

console.log("=== Lookup throughput by strategy (8 nodes) ===\n");
printTable(runStrategyComparison());

console.log("\n=== Lookup throughput vs vnode count (vnode-ring, 8 nodes) ===\n");
printTable(runLookupVnodeSweep());

console.log("\n=== Ring construction time vs node count ===\n");
printTable(runBuildTimeSweep());
