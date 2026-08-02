import { describe, expect, test } from "bun:test";
import { DuplicateNodeError, EmptyRingError, UnsupportedOperationError } from "./sharder";

describe("error classes", () => {
  test("UnsupportedOperationError names the strategy and operation", () => {
    const err = new UnsupportedOperationError("ModuloSharder", "weighted nodes");
    expect(err.name).toBe("UnsupportedOperationError");
    expect(err.message).toBe("ModuloSharder does not support weighted nodes");
  });

  test("DuplicateNodeError names the offending id", () => {
    const err = new DuplicateNodeError("cache-3");
    expect(err.name).toBe("DuplicateNodeError");
    expect(err.message).toContain("cache-3");
  });

  test("EmptyRingError has a fixed, descriptive message", () => {
    const err = new EmptyRingError();
    expect(err.name).toBe("EmptyRingError");
    expect(err.message).toMatch(/no nodes/i);
  });
});
