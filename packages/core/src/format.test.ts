import { describe, expect, it } from "vite-plus/test";
import { formatDate, formatMoney } from "./index";

const dotComma = { numberFormat: "dot-comma" } as const;
const commaDot = { numberFormat: "comma-dot" } as const;

describe("formatMoney", () => {
  it("shows rupiah with no decimals and dot thousands", () => {
    expect(formatMoney(25000, "IDR", dotComma)).toBe("Rp 25.000");
    expect(formatMoney(1234567, "IDR", dotComma)).toBe("Rp 1.234.567");
    expect(formatMoney(0, "IDR", dotComma)).toBe("Rp 0");
  });

  it("shows other currencies with their own minor units", () => {
    expect(formatMoney(123450, "USD", commaDot)).toBe("$1,234.50");
    expect(formatMoney(5, "USD", commaDot)).toBe("$0.05");
    expect(formatMoney(1500, "JPY", commaDot)).toBe("¥1,500");
    expect(formatMoney(100050, "EUR", dotComma)).toBe("€1.000,50");
  });

  it("lets the separator style be chosen independently of the currency", () => {
    expect(formatMoney(25000, "IDR", commaDot)).toBe("Rp 25,000");
    expect(formatMoney(123450, "USD", dotComma)).toBe("$1.234,50");
  });

  it("puts the sign before the symbol", () => {
    expect(formatMoney(-25000, "IDR", dotComma)).toBe("-Rp 25.000");
    expect(formatMoney(-5, "USD", commaDot)).toBe("-$0.05");
  });

  it("groups only past three digits", () => {
    expect(formatMoney(999, "JPY", commaDot)).toBe("¥999");
    expect(formatMoney(1000, "JPY", commaDot)).toBe("¥1,000");
  });

  it("rejects amounts that are not whole minor units and unknown currencies", () => {
    expect(() => formatMoney(1.5, "USD", commaDot)).toThrow();
    expect(() => formatMoney(100, "XXX" as never, commaDot)).toThrow();
  });
});

describe("formatDate", () => {
  it("writes plain dates in Indonesian and English", () => {
    expect(formatDate("2026-10-18", "id")).toBe("18 Okt 2026");
    expect(formatDate("2026-10-18", "en")).toBe("18 Oct 2026");
    expect(formatDate("2026-08-17", "id")).toBe("17 Agt 2026");
    expect(formatDate("2026-05-01", "id")).toBe("1 Mei 2026");
    expect(formatDate("2026-12-25", "id")).toBe("25 Des 2026");
  });

  it("rejects dates that do not exist", () => {
    expect(() => formatDate("2026-02-30", "en")).toThrow();
  });
});
