import { describe, expect, it } from "vite-plus/test";
import { formatPercent } from "./percent";

describe("formatPercent", () => {
  it("shows basis points as a percentage with at most one decimal", () => {
    expect(formatPercent(9_180, "comma-dot")).toBe("91.8");
    expect(formatPercent(5_000, "comma-dot")).toBe("50");
    expect(formatPercent(10_000, "comma-dot")).toBe("100");
    expect(formatPercent(0, "comma-dot")).toBe("0");
    expect(formatPercent(164, "comma-dot")).toBe("1.6");
    expect(formatPercent(4, "comma-dot")).toBe("0");
  });

  it("uses the decimal separator of the chosen number format", () => {
    expect(formatPercent(9_180, "dot-comma")).toBe("91,8");
    expect(formatPercent(5_000, "dot-comma")).toBe("50");
  });
});
