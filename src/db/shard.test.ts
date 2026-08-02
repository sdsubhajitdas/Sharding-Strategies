import { describe, expect, test } from "bun:test";
import { Shard } from "./shard";

describe("Shard", () => {
  test("set then get roundtrips a value", () => {
    const shard = new Shard("s1");
    shard.set("k1", { hello: "world" });
    expect(shard.get("k1")).toEqual({ key: "k1", value: { hello: "world" } });
  });

  test("get on a missing key returns undefined", () => {
    const shard = new Shard("s1");
    expect(shard.get("missing")).toBeUndefined();
  });

  test("delete removes a row and reports whether it existed", () => {
    const shard = new Shard("s1");
    shard.set("k1", "v1");
    expect(shard.delete("k1")).toBe(true);
    expect(shard.get("k1")).toBeUndefined();
    expect(shard.delete("k1")).toBe(false);
  });

  test("size reflects row count", () => {
    const shard = new Shard("s1");
    expect(shard.size).toBe(0);
    shard.set("a", 1);
    shard.set("b", 2);
    expect(shard.size).toBe(2);
  });

  test("stats() counts reads and writes independently", () => {
    const shard = new Shard("s1");
    shard.set("a", 1);
    shard.set("b", 2);
    shard.get("a");
    shard.get("missing");
    const stats = shard.stats();
    expect(stats.rows).toBe(2);
    expect(stats.writes).toBe(2);
    expect(stats.reads).toBe(2);
    expect(stats.bytesApprox).toBeGreaterThan(0);
  });

  test("entries() iterates stored rows without incrementing reads", () => {
    const shard = new Shard("s1");
    shard.set("a", 1);
    shard.set("b", 2);
    const keys = Array.from(shard.entries()).map((r) => r.key);
    expect(new Set(keys)).toEqual(new Set(["a", "b"]));
    expect(shard.stats().reads).toBe(0);
  });
});
