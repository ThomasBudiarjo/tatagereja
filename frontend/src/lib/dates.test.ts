import { describe, expect, it } from "vitest";
import { addDays, formatDateID, formatMonthID, monthRange, shiftMonth, weekRange } from "./dates";

describe("weekRange", () => {
  it("returns Monday through Sunday for a mid-week date", () => {
    // 2026-07-08 is a Wednesday.
    expect(weekRange("2026-07-08")).toEqual({ from: "2026-07-06", to: "2026-07-12" });
  });

  it("treats Sunday as the last day of the week", () => {
    // 2026-07-05 is a Sunday.
    expect(weekRange("2026-07-05")).toEqual({ from: "2026-06-29", to: "2026-07-05" });
  });

  it("treats Monday as the first day of the week", () => {
    // 2026-07-06 is a Monday.
    expect(weekRange("2026-07-06")).toEqual({ from: "2026-07-06", to: "2026-07-12" });
  });
});

describe("monthRange", () => {
  it("spans the full month", () => {
    expect(monthRange("2026-07-15")).toEqual({ from: "2026-07-01", to: "2026-07-31" });
  });

  it("handles February in a leap year", () => {
    expect(monthRange("2028-02-10")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
  });
});

describe("shiftMonth", () => {
  it("moves to the first day of adjacent months", () => {
    expect(shiftMonth("2026-07-15", 1)).toBe("2026-08-01");
    expect(shiftMonth("2026-07-15", -1)).toBe("2026-06-01");
  });

  it("does not overflow short months", () => {
    expect(shiftMonth("2026-01-31", 1)).toBe("2026-02-01");
  });

  it("crosses year boundaries", () => {
    expect(shiftMonth("2026-12-10", 1)).toBe("2027-01-01");
    expect(shiftMonth("2026-01-10", -1)).toBe("2025-12-01");
  });
});

describe("addDays", () => {
  it("crosses month boundaries", () => {
    expect(addDays("2026-07-31", 1)).toBe("2026-08-01");
    expect(addDays("2026-07-01", -1)).toBe("2026-06-30");
  });
});

describe("formatting", () => {
  it("formats dates in Indonesian", () => {
    expect(formatDateID("2026-07-05")).toBe("Minggu, 5 Juli 2026");
  });

  it("formats months in Indonesian", () => {
    expect(formatMonthID("2026-07-05")).toBe("Juli 2026");
  });
});
