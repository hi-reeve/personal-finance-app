import { describe, expect, it } from "vite-plus/test";
import { dateFormats, formatDate, formatMoney, parseMoney } from "./index";

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

  it("shows negative zero as plain zero", () => {
    expect(formatMoney(-0, "IDR", dotComma)).toBe("Rp 0");
    expect(formatMoney(-0, "USD", commaDot)).toBe("$0.00");
  });

  it("rejects amounts that are not whole minor units and unknown currencies", () => {
    expect(() => formatMoney(Number.MAX_SAFE_INTEGER + 1, "USD", commaDot)).toThrow();
    expect(() => formatMoney(100, "toString" as never, commaDot)).toThrow();
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

describe("parseMoney", () => {
  it("reads typed amounts in the chosen separator style, as whole minor units", () => {
    expect(parseMoney("25000", "IDR", dotComma)).toBe(25_000);
    expect(parseMoney("1.234.567", "IDR", dotComma)).toBe(1_234_567);
    expect(parseMoney("1,234.50", "USD", commaDot)).toBe(123_450);
    expect(parseMoney("1.234,5", "EUR", dotComma)).toBe(123_450);
    expect(parseMoney("12.05", "USD", commaDot)).toBe(1_205);
    expect(parseMoney(" 7 ", "USD", commaDot)).toBe(700);
  });

  it("reads negatives, and keeps negative zero out", () => {
    expect(parseMoney("-25.000", "IDR", dotComma)).toBe(-25_000);
    expect(parseMoney("-0", "IDR", dotComma)).toBe(0);
    expect(Object.is(parseMoney("-0", "IDR", dotComma), 0)).toBe(true);
  });

  it("rejects anything that is not exactly an amount", () => {
    for (const bad of ["", " ", "abc", "1,5", "12.34", "1.2.3", "--1", "1e3", "Rp 5"]) {
      expect(parseMoney(bad, "IDR", dotComma), bad).toBeUndefined();
    }
    expect(parseMoney("1.234", "USD", commaDot)).toBeUndefined();
    expect(parseMoney("99999999999999999", "IDR", dotComma)).toBeUndefined();
  });
});

describe("formatDate with a chosen format", () => {
  it("writes the same day in each format", () => {
    expect(formatDate("2026-10-08", "en", "medium")).toBe("8 Oct 2026");
    expect(formatDate("2026-10-08", "id", "medium")).toBe("8 Okt 2026");
    expect(formatDate("2026-10-08", "en", "day-month-year")).toBe("08/10/2026");
    expect(formatDate("2026-10-08", "id", "month-day-year")).toBe("10/08/2026");
    expect(formatDate("2026-10-08", "en", "iso")).toBe("2026-10-08");
  });

  it("keeps the medium format when none is chosen, and lists every choice", () => {
    expect(formatDate("2026-10-18", "id")).toBe("18 Okt 2026");
    expect([...dateFormats]).toEqual(["medium", "day-month-year", "month-day-year", "iso"]);
  });

  it("still rejects a date that does not exist", () => {
    expect(() => formatDate("2026-02-30", "en", "iso")).toThrow();
  });
});
