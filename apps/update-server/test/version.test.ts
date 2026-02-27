import { describe, expect, it } from "vitest";
import { compareVersions, isValidVersion } from "../src/version.js";

describe("isValidVersion", () => {
  it("accepts valid semver", () => {
    expect(isValidVersion("0.1.0")).toBe(true);
    expect(isValidVersion("1.2.3")).toBe(true);
    expect(isValidVersion("10.20.30")).toBe(true);
  });

  it("rejects versions with query strings", () => {
    expect(isValidVersion("1.2.3?x=1")).toBe(false);
  });

  it("rejects versions with prerelease tags", () => {
    expect(isValidVersion("1.2.3-beta")).toBe(false);
  });

  it("rejects non-numeric segments", () => {
    expect(isValidVersion("1.2.abc")).toBe(false);
    expect(isValidVersion("abc")).toBe(false);
  });

  it("rejects too few segments", () => {
    expect(isValidVersion("1.2")).toBe(false);
    expect(isValidVersion("1")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidVersion("")).toBe(false);
  });
});

describe("compareVersions", () => {
  it("returns 0 for equal versions", () => {
    expect(compareVersions("1.2.3", "1.2.3")).toBe(0);
  });

  it("compares major versions", () => {
    expect(compareVersions("2.0.0", "1.0.0")).toBe(1);
    expect(compareVersions("1.0.0", "2.0.0")).toBe(-1);
  });

  it("compares minor versions", () => {
    expect(compareVersions("1.3.0", "1.2.0")).toBe(1);
    expect(compareVersions("1.2.0", "1.3.0")).toBe(-1);
  });

  it("compares patch versions", () => {
    expect(compareVersions("1.2.4", "1.2.3")).toBe(1);
    expect(compareVersions("1.2.3", "1.2.4")).toBe(-1);
  });

  it("throws on invalid version", () => {
    expect(() => compareVersions("1.2.3?x=1", "1.2.3")).toThrow(
      "Invalid version",
    );
    expect(() => compareVersions("1.2.3", "abc")).toThrow("Invalid version");
  });
});
