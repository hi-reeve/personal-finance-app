import { describe, expect, it } from "vite-plus/test";
import { formatRateInput, parseRateInput } from "./rate-input";

describe("rate input", () => {
  it("reads a rate in either number format", () => {
    expect(parseRateInput("16.250,5", "dot-comma")).toBe("16250.5");
    expect(parseRateInput("16,250.5", "comma-dot")).toBe("16250.5");
    expect(parseRateInput("0,0000615", "dot-comma")).toBe("0.0000615");
    expect(parseRateInput(" 1 ", "comma-dot")).toBe("1");
  });

  it("rejects anything that is not a rate", () => {
    for (const bad of ["", "abc", "0", "-3", "1,5,5"]) {
      expect(parseRateInput(bad, "dot-comma"), bad).toBeUndefined();
    }
  });

  it("shows a rate with the chosen decimal separator", () => {
    expect(formatRateInput("16250.5", "dot-comma")).toBe("16250,5");
    expect(formatRateInput("16250.5", "comma-dot")).toBe("16250.5");
  });
});
