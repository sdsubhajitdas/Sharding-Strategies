import { describe, expect, test } from "bun:test";
import { crc16, crc16Mod32768 } from "./crc16";

describe("crc16", () => {
  test("matches the standard CRC-16/XMODEM check value", () => {
    // 0x31C3 is the universally-cited check value for this exact variant
    // (poly 0x1021, init 0, no reflection, no final XOR) on the input
    // "123456789" — the standard way to verify a CRC implementation
    // without needing a full reference table.
    expect(crc16("123456789")).toBe(0x31c3);
  });

  test("is deterministic", () => {
    expect(crc16("hello-world")).toBe(crc16("hello-world"));
  });

  test("produces a value within the 16-bit range", () => {
    const value = crc16("some-arbitrary-key");
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(0xffff);
  });

  test("empty string hashes to 0 (matches the reference algorithm's initial value)", () => {
    expect(crc16("")).toBe(0);
  });
});

describe("crc16Mod32768", () => {
  test("output is always within [0, 32768)", () => {
    for (let i = 0; i < 1000; i++) {
      const value = crc16Mod32768.hash(`key-${i}`);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(32768);
    }
  });

  test("is deterministic", () => {
    expect(crc16Mod32768.hash("some-key")).toBe(crc16Mod32768.hash("some-key"));
  });

  test("name reflects the bounded range", () => {
    expect(crc16Mod32768.name).toBe("crc16-32768");
  });
});
