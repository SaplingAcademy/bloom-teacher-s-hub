import { describe, expect, test } from "bun:test";
import { parseMoneyBRL } from "../src/lib/growth-engine";
import { convertOnboardingToWorkingAvailability } from "../src/lib/availability-engine";

describe("parseMoneyBRL", () => {
  test.each([
    ["10000", 10000], ["10.000", 10000], ["10.000,00", 10000],
    ["10000,00", 10000], ["R$ 10.000,00", 10000], ["1.234,56", 1234.56], ["10000.50", 10000.5],
  ])("%s", (raw, v) => expect(parseMoneyBRL(raw as string)).toBe(v as number));
  test("empty/invalid → null (no invented default)", () => {
    expect(parseMoneyBRL("")).toBeNull();
    expect(parseMoneyBRL("abc")).toBeNull();
    expect(parseMoneyBRL("10.00.0")).toBeNull();
    expect(parseMoneyBRL(undefined)).toBeNull();
  });
});

describe("onboarding availability", () => {
  test("saves exactly the chosen days", () => {
    const a = convertOnboardingToWorkingAvailability({
      workingDays: ["Tuesday", "Saturday"], sameAvailabilityAllDays: true,
      unifiedAvailability: { startTime: "13:00", endTime: "20:00" },
    });
    expect(a.filter((d) => d.enabled).map((d) => d.day)).toEqual(["Tuesday", "Saturday"]);
    expect(a.find((d) => d.day === "Tuesday")).toMatchObject({ startTime: "13:00", endTime: "20:00" });
  });
});
