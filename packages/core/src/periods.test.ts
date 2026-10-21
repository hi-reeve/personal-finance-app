import { describe, expect, it } from "vite-plus/test";
import { daysIn, formatDay, formatMonth, formatMonthShort, monthOf, shiftMonth } from "./index";

describe("monthOf", () => {
  it("is the whole calendar month around a date", () => {
    expect(monthOf("2026-10-18")).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(monthOf("2026-02-01")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(monthOf("2028-02-29")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(monthOf("2026-12-31")).toEqual({ from: "2026-12-01", to: "2026-12-31" });
  });

  it("rejects a date that does not exist", () => {
    expect(() => monthOf("2026-02-30")).toThrow();
    expect(() => monthOf("soon")).toThrow();
  });
});

describe("shiftMonth", () => {
  it("moves a month forwards or backwards, across years", () => {
    const october = monthOf("2026-10-18");
    expect(shiftMonth(october, -1)).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(shiftMonth(october, 3)).toEqual({ from: "2027-01-01", to: "2027-01-31" });
    expect(shiftMonth(monthOf("2026-03-31"), -1)).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(shiftMonth(october, 0)).toEqual(october);
  });
});

describe("daysIn", () => {
  it("lists every day of a period in order, both ends included", () => {
    expect(daysIn({ from: "2026-02-27", to: "2026-03-02" })).toEqual([
      "2026-02-27",
      "2026-02-28",
      "2026-03-01",
      "2026-03-02",
    ]);
    expect(daysIn({ from: "2026-10-05", to: "2026-10-05" })).toEqual(["2026-10-05"]);
  });

  it("refuses a backwards or enormous period", () => {
    expect(() => daysIn({ from: "2026-10-05", to: "2026-10-04" })).toThrow();
    expect(() => daysIn({ from: "2000-01-01", to: "2026-01-01" })).toThrow();
  });
});

describe("month and day labels", () => {
  it("name the month in full, in Indonesian and English", () => {
    expect(formatMonth("2026-10-18", "en")).toBe("October 2026");
    expect(formatMonth("2026-10-18", "id")).toBe("Oktober 2026");
    expect(formatMonth("2026-08-17", "id")).toBe("Agustus 2026");
    expect(formatMonth("2026-05-01", "id")).toBe("Mei 2026");
  });

  it("write a day without the year", () => {
    expect(formatDay("2026-10-18", "en")).toBe("18 Oct");
    expect(formatDay("2026-08-17", "id")).toBe("17 Agt");
  });
});

describe("short month names", () => {
  it("are three letters in the language", () => {
    expect(formatMonthShort("2026-10-18", "en")).toBe("Oct");
    expect(formatMonthShort("2026-08-17", "id")).toBe("Agt");
    expect(formatMonthShort("2026-10-18", "id")).toBe("Okt");
  });
});
