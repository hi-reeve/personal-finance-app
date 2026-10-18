import { describe, expect, it } from "vite-plus/test";
import { base64UrlDecode, base64UrlEncode, signingString } from "./index";

describe("base64url", () => {
  it("round-trips any bytes, with no padding or unsafe characters", () => {
    for (const length of [0, 1, 2, 3, 4, 31, 32, 33, 255]) {
      const bytes = Uint8Array.from({ length }, (_, i) => (i * 37 + 11) % 256);
      const text = base64UrlEncode(bytes);
      expect(text).toMatch(/^[A-Za-z0-9_-]*$/);
      expect(base64UrlDecode(text)).toEqual(bytes);
    }
  });

  it("matches a known value", () => {
    expect(base64UrlEncode(new Uint8Array([0xfb, 0xff, 0xfe]))).toBe("-__-");
    expect(base64UrlEncode(Uint8Array.from("hello", (char) => char.charCodeAt(0)))).toBe("aGVsbG8");
  });

  it("rejects text that is not base64url", () => {
    expect(() => base64UrlDecode("not valid!")).toThrow();
  });
});

describe("signingString", () => {
  const parts = {
    method: "post",
    path: "/v1/spaces/s1/ops?after=3",
    timestamp: 1_700_000_000_000,
    bodySha256: "ab12",
  };

  it("is the same for the same request and different when anything changes", () => {
    const base = signingString(parts);
    expect(signingString({ ...parts })).toBe(base);
    for (const change of [
      { method: "GET" },
      { path: "/v1/spaces/s2/ops" },
      { timestamp: 1 },
      { bodySha256: "ab13" },
    ]) {
      expect(signingString({ ...parts, ...change })).not.toBe(base);
    }
  });

  it("treats the method case-insensitively", () => {
    expect(signingString({ ...parts, method: "POST" })).toBe(
      signingString({ ...parts, method: "post" }),
    );
  });
});
