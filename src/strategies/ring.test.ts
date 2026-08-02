import { describe, expect, test } from "bun:test";
import { RingSharder } from "./ring";
import { DuplicateNodeError, EmptyRingError, UnsupportedOperationError } from "../sharder";
import type { HashFunction } from "../hash/types";

/** A hash function with fully controllable output, for deterministically testing ring geometry (wrap-around, boundaries) without depending on murmur3's actual output. */
function fakeHash(fixed: Record<string, number>): HashFunction {
  return {
    name: "fake",
    hash(input: string): number {
      const value = fixed[input];
      if (value === undefined) throw new Error(`fakeHash: no fixture for "${input}"`);
      return value;
    },
  };
}

describe("RingSharder", () => {
  describe("empty ring", () => {
    test("getNode throws EmptyRingError", () => {
      const ring = new RingSharder();
      expect(() => ring.getNode("key")).toThrow(EmptyRingError);
    });

    test("getNodes throws EmptyRingError", () => {
      const ring = new RingSharder();
      expect(() => ring.getNodes("key", 2)).toThrow(EmptyRingError);
    });

    test("nodes is empty and stats().positions is 0", () => {
      const ring = new RingSharder();
      expect(ring.nodes).toEqual([]);
      expect(ring.stats().positions).toBe(0);
    });
  });

  describe("single node", () => {
    test("getNode always returns the sole node, for any key", () => {
      const ring = new RingSharder();
      ring.addNode("only");
      expect(ring.getNode("a")).toBe("only");
      expect(ring.getNode("totally-different-key")).toBe("only");
    });

    test("getNodes(key, count) never returns more than the 1 available node", () => {
      const ring = new RingSharder();
      ring.addNode("only");
      expect(ring.getNodes("a", 5)).toEqual(["only"]);
    });
  });

  describe("wrap-around", () => {
    // Three nodes placed at fixed ring positions 100, 200, 300.
    const hashFn = fakeHash({
      "node-a": 100,
      "node-b": 200,
      "node-c": 300,
      "below-all": 50,
      "between-a-b": 150,
      "exactly-on-b": 200,
      "above-all": 999,
    });

    function buildRing(): RingSharder {
      const ring = new RingSharder(hashFn);
      ring.addNode("node-a");
      ring.addNode("node-b");
      ring.addNode("node-c");
      return ring;
    }

    test("a key hashing below every position lands on the lowest position", () => {
      expect(buildRing().getNode("below-all")).toBe("node-a");
    });

    test("a key hashing between two positions lands on the next-highest one", () => {
      expect(buildRing().getNode("between-a-b")).toBe("node-b");
    });

    test("a key hashing exactly onto a position lands on that position's node", () => {
      expect(buildRing().getNode("exactly-on-b")).toBe("node-b");
    });

    test("a key hashing above every position wraps around to the first position", () => {
      expect(buildRing().getNode("above-all")).toBe("node-a");
    });
  });

  describe("duplicate node IDs", () => {
    test("addNode throws DuplicateNodeError on a repeated id", () => {
      const ring = new RingSharder();
      ring.addNode("a");
      expect(() => ring.addNode("a")).toThrow(DuplicateNodeError);
      expect(ring.nodes).toEqual(["a"]);
    });
  });

  describe("removeNode", () => {
    test("removing a nonexistent node is a no-op", () => {
      const ring = new RingSharder();
      ring.addNode("a");
      expect(() => ring.removeNode("nonexistent")).not.toThrow();
      expect(ring.nodes).toEqual(["a"]);
    });

    test("removing a node stops it from being returned", () => {
      const ring = new RingSharder();
      for (const id of ["a", "b", "c"]) ring.addNode(id);
      ring.removeNode("b");
      expect(ring.nodes).toEqual(["a", "c"]);
      for (let i = 0; i < 200; i++) {
        expect(ring.getNode(`key-${i}`)).not.toBe("b");
      }
    });
  });

  describe("getNodes(key, count)", () => {
    test("count > nodes.length returns every distinct node exactly once", () => {
      const ring = new RingSharder();
      for (const id of ["a", "b", "c"]) ring.addNode(id);
      const result = ring.getNodes("some-key", 10);
      expect(result).toHaveLength(3);
      expect(new Set(result)).toEqual(new Set(["a", "b", "c"]));
    });

    test("first result matches getNode for the same key", () => {
      const ring = new RingSharder();
      for (const id of ["a", "b", "c", "d", "e"]) ring.addNode(id);
      const result = ring.getNodes("some-key", 3);
      expect(result[0]).toBe(ring.getNode("some-key"));
      expect(new Set(result).size).toBe(3);
    });
  });

  describe("weighting", () => {
    test("addNode throws UnsupportedOperationError for weight != 1 (plain ring can't weight a single position)", () => {
      const ring = new RingSharder();
      expect(() => ring.addNode("a", 2)).toThrow(UnsupportedOperationError);
    });

    test("addNode with weight 1 is accepted", () => {
      const ring = new RingSharder();
      expect(() => ring.addNode("a", 1)).not.toThrow();
    });
  });

  describe("general routing", () => {
    test("routes deterministically for the same key", () => {
      const ring = new RingSharder();
      for (const id of ["a", "b", "c"]) ring.addNode(id);
      const node = ring.getNode("some-key");
      expect(ring.getNode("some-key")).toBe(node);
    });

    test("stats().positions equals node count (one position per node)", () => {
      const ring = new RingSharder();
      for (const id of ["a", "b", "c", "d"]) ring.addNode(id);
      expect(ring.stats().positions).toBe(4);
      expect(ring.stats().bytesApprox).toBeGreaterThan(0);
    });
  });
});
