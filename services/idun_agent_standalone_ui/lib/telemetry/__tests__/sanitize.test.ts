import { describe, expect, it } from "vitest";
import { sanitize } from "../sanitize";

describe("sanitize", () => {
  it("redacts sensitive keys (case-insensitive, normalized)", () => {
    const input = {
      api_key: "secret",
      apiKey: "secret",
      ACCESS_TOKEN: "secret",
      Authorization: "Bearer xyz",
      bearer: "abc",
      client_secret: "shh",
      password: "p",
      passphrase: "p",
      privateKey: "k",
      safe: "ok",
    };
    const out = sanitize(input);
    expect(out).toEqual({
      api_key: "[redacted]",
      apiKey: "[redacted]",
      ACCESS_TOKEN: "[redacted]",
      Authorization: "[redacted]",
      bearer: "[redacted]",
      client_secret: "[redacted]",
      password: "[redacted]",
      passphrase: "[redacted]",
      privateKey: "[redacted]",
      safe: "ok",
    });
  });

  it("walks nested objects", () => {
    expect(sanitize({ nested: { token: "x", keep: 1 } })).toEqual({
      nested: { token: "[redacted]", keep: 1 },
    });
  });

  it("walks arrays", () => {
    expect(sanitize([{ token: "x" }, { keep: 1 }])).toEqual([
      { token: "[redacted]" },
      { keep: 1 },
    ]);
  });

  it("truncates string values at 200 chars", () => {
    const long = "a".repeat(500);
    const out = sanitize({ note: long }) as { note: string };
    expect(out.note).toHaveLength(200);
    expect(out.note).toBe("a".repeat(200));
  });

  it("strips PEM private-key markers", () => {
    const out = sanitize({
      payload: "-----BEGIN OPENSSH PRIVATE KEY-----\nMIIE...\n",
    }) as { payload: string };
    expect(out.payload).toBe("[redacted]");
  });

  it("passes through numbers, booleans, null", () => {
    expect(sanitize({ n: 1, b: true, z: null, s: "ok" })).toEqual({
      n: 1,
      b: true,
      z: null,
      s: "ok",
    });
  });

  it("handles circular references without infinite recursion", () => {
    const obj: Record<string, unknown> = { name: "ok" };
    obj.self = obj;
    expect(() => sanitize(obj)).not.toThrow();
    const out = sanitize(obj) as Record<string, unknown>;
    expect(out.name).toBe("ok");
    expect(out.self).toBe("[circular]");
  });
});
