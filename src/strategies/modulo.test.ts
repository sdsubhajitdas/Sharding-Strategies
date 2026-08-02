import { describe, expect, test } from "bun:test";
import { ModuloSharder } from "./modulo";
import { DuplicateNodeError, EmptyRingError, UnsupportedOperationError } from "../sharder";

describe("ModuloSharder", () => {
  test("routes deterministically for the same key", () => {
    const sharder = new ModuloSharder();
    sharder.addNode("a");
    sharder.addNode("b");
    sharder.addNode("c");
    const node = sharder.getNode("some-key");
    expect(sharder.getNode("some-key")).toBe(node);
  });

  test("distributes keys across all added nodes", () => {
    const sharder = new ModuloSharder();
    for (const id of ["a", "b", "c", "d"]) sharder.addNode(id);
    const hit = new Set<string>();
    for (let i = 0; i < 1000; i++) hit.add(sharder.getNode(`key-${i}`));
    expect(hit).toEqual(new Set(["a", "b", "c", "d"]));
  });

  test("nodes reflects add order and removal", () => {
    const sharder = new ModuloSharder();
    sharder.addNode("a");
    sharder.addNode("b");
    sharder.addNode("c");
    expect(sharder.nodes).toEqual(["a", "b", "c"]);
    sharder.removeNode("b");
    expect(sharder.nodes).toEqual(["a", "c"]);
  });

  test("getNode throws EmptyRingError with no nodes added", () => {
    const sharder = new ModuloSharder();
    expect(() => sharder.getNode("key")).toThrow(EmptyRingError);
  });

  test("getNodes throws EmptyRingError with no nodes added", () => {
    const sharder = new ModuloSharder();
    expect(() => sharder.getNodes("key", 2)).toThrow(EmptyRingError);
  });

  test("removeNode on a nonexistent id is a no-op", () => {
    const sharder = new ModuloSharder();
    sharder.addNode("a");
    expect(() => sharder.removeNode("nonexistent")).not.toThrow();
    expect(sharder.nodes).toEqual(["a"]);
  });

  test("addNode throws DuplicateNodeError on a repeated id", () => {
    const sharder = new ModuloSharder();
    sharder.addNode("a");
    expect(() => sharder.addNode("a")).toThrow(DuplicateNodeError);
    // failed add must not have corrupted state
    expect(sharder.nodes).toEqual(["a"]);
  });

  test("addNode with weight 1 is accepted (explicit default)", () => {
    const sharder = new ModuloSharder();
    expect(() => sharder.addNode("a", 1)).not.toThrow();
  });

  test("addNode throws UnsupportedOperationError for weight != 1", () => {
    const sharder = new ModuloSharder();
    expect(() => sharder.addNode("a", 2)).toThrow(UnsupportedOperationError);
  });

  test("getNodes(key, count) with count > nodes.length returns every node exactly once", () => {
    const sharder = new ModuloSharder();
    sharder.addNode("a");
    sharder.addNode("b");
    sharder.addNode("c");
    const result = sharder.getNodes("some-key", 10);
    expect(result).toHaveLength(3);
    expect(new Set(result)).toEqual(new Set(["a", "b", "c"]));
  });

  test("getNodes(key, count) returns count distinct nodes when available", () => {
    const sharder = new ModuloSharder();
    for (const id of ["a", "b", "c", "d", "e"]) sharder.addNode(id);
    const result = sharder.getNodes("some-key", 3);
    expect(result).toHaveLength(3);
    expect(new Set(result).size).toBe(3);
    expect(result[0]).toBe(sharder.getNode("some-key"));
  });

  test("stats() reports one position per node", () => {
    const sharder = new ModuloSharder();
    sharder.addNode("a");
    sharder.addNode("b");
    expect(sharder.stats().positions).toBe(2);
    expect(sharder.stats().bytesApprox).toBeGreaterThan(0);
  });
});
