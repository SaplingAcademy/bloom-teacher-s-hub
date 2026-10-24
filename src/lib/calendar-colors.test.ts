import { expect, test } from "vitest";
import { resolveCalendarColor, toStoredColorKey } from "./calendar-colors";
test("precedence", () => {
  expect(resolveCalendarColor({})).toBeNull();
  expect(resolveCalendarColor({ isCustom: true })).toBeNull();
  expect(resolveCalendarColor({ scheduleColorKey: "rose" })?.swatchHex).toBe("#d53f8c");
  expect(resolveCalendarColor({ eventColorKey: "gray", scheduleColorKey: "rose" })?.swatchHex).toBe("#718096");
  expect(toStoredColorKey("default")).toBeNull();
});
