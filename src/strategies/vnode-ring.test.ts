import { describe, expect, test } from "bun:test";
import { VirtualNodeRingSharder, DEFAULT_VNODE_COUNT } from "./vnode-ring";
import { RingSharder } from "./ring";
import { DuplicateNodeError, EmptyRingError, UnsupportedOperationError } from "../sharder";

describe("VirtualNodeRingSharder", () => {
  describe("inherited RingSharder behavior", () => {
    test("empty ring throws EmptyRingError", () => {
      const ring = new VirtualNodeRingSharder();
      expect(() => ring.getNode("key")).toThrow(EmptyRingError);
    });

    test("single node always answers with itself", () => {
      const ring = new VirtualNodeRingSharder();
      ring.addNode("only");
      expect(ring.getNode("some-key")).toBe("only");
    });

    test("duplicate node id throws DuplicateNodeError", () => {
      const ring = new VirtualNodeRingSharder();
      ring.addNode("a");
      expect(() => ring.addNode("a")).toThrow(DuplicateNodeError);
    });

    test("removing a nonexistent node is a no-op", () => {
      const ring = new VirtualNodeRingSharder();
      ring.addNode("a");
      expect(() => ring.removeNode("nonexistent")).not.toThrow();
    });

    test("getNodes(key, count) with count > nodes.length returns every distinct node once", () => {
      const ring = new VirtualNodeRingSharder();
      for (const id of ["a", "b", "c"]) ring.addNode(id);
      const result = ring.getNodes("some-key", 10);
      expect(result).toHaveLength(3);
      expect(new Set(result)).toEqual(new Set(["a", "b", "c"]));
    });

    test("routes deterministically for the same key", () => {
      const ring = new VirtualNodeRingSharder();
      for (const id of ["a", "b", "c"]) ring.addNode(id);
      const node = ring.getNode("some-key");
      expect(ring.getNode("some-key")).toBe(node);
    });
  });

  describe("vnode count", () => {
    test("defaults to 150 positions per node", () => {
      const ring = new VirtualNodeRingSharder();
      ring.addNode("a");
      ring.addNode("b");
      expect(ring.stats().positions).toBe(DEFAULT_VNODE_COUNT * 2);
    });

    test("is configurable via the constructor", () => {
      const ring = new VirtualNodeRingSharder(undefined, 10);
      ring.addNode("a");
      ring.addNode("b");
      expect(ring.stats().positions).toBe(20);
    });
  });

  describe("weighting", () => {
    test("a weight-2 node gets ~2x the ring positions of a weight-1 node", () => {
      const ring = new VirtualNodeRingSharder(undefined, 100);
      ring.addNode("light", 1);
      ring.addNode("heavy", 2);
      expect(ring.stats().positions).toBe(300); // 100 + 200
    });

    test("throws UnsupportedOperationError for non-positive weight", () => {
      const ring = new VirtualNodeRingSharder();
      expect(() => ring.addNode("a", 0)).toThrow(UnsupportedOperationError);
      expect(() => ring.addNode("b", -1)).toThrow(UnsupportedOperationError);
    });
  });

  describe("fixes plain ring's balance regression", () => {
    test("CoV of keys-per-node is dramatically lower than plain ring for the same topology", () => {
      const keys = 100_000;
      const nodeCount = 8;

      function coefficientOfVariation(sharderNodes: string[], getNode: (key: string) => string): number {
        const counts = new Map(sharderNodes.map((id) => [id, 0]));
        for (let i = 0; i < keys; i++) {
          const id = getNode(`key-${i}`);
          counts.set(id, (counts.get(id) ?? 0) + 1);
        }
        const values = Array.from(counts.values());
        const mean = keys / sharderNodes.length;
        const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / sharderNodes.length;
        return Math.sqrt(variance) / mean;
      }

      const plain = new RingSharder();
      const vnode = new VirtualNodeRingSharder();
      const ids = Array.from({ length: nodeCount }, (_, i) => `node-${i}`);
      for (const id of ids) {
        plain.addNode(id);
        vnode.addNode(id);
      }

      const plainCov = coefficientOfVariation(ids, (k) => plain.getNode(k));
      const vnodeCov = coefficientOfVariation(ids, (k) => vnode.getNode(k));

      expect(vnodeCov).toBeLessThan(plainCov / 3);
    });
  });
});
