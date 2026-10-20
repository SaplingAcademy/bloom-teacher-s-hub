import { describe, expect, test } from "bun:test";
import {
  attendanceUrgency, paymentReason, contractReason, homeworkRequiresAction,
  suppressCoveredLeadItems, sortDailyPriorities, type DailyPriorityItem,
} from "../src/lib/daily-priorities";

const item = (p: Partial<DailyPriorityItem>): DailyPriorityItem => ({
  id: "x", category: "lead", urgency: "upcoming", reason: "lead_stale", title: "", params: {}, date: null, ref: {}, action: { route: "/" }, ...p,
});

describe("daily priorities rules", () => {
  test("attendance becomes critical only after more than 5 days", () => {
    expect(attendanceUrgency("2026-10-15", "2026-10-20")).toBe("today");
    expect(attendanceUrgency("2026-10-14", "2026-10-20")).toBe("critical");
  });
  test("payments: overdue, today, 5-day reminder, nothing beyond", () => {
    expect(paymentReason("2026-10-19", "2026-10-20")).toBe("payment_overdue");
    expect(paymentReason("2026-10-20", "2026-10-20")).toBe("payment_due_today");
    expect(paymentReason("2026-10-25", "2026-10-20")).toBe("payment_reminder");
    expect(paymentReason("2026-10-26", "2026-10-20")).toBeNull();
  });
  test("contracts: ended, 15 and 30 day windows", () => {
    expect(contractReason(0)).toBe("contract_ended");
    expect(contractReason(15)).toBe("contract_ending_15d");
    expect(contractReason(30)).toBe("contract_ending_30d");
    expect(contractReason(31)).toBeNull();
  });
  test("homework with no assignment is never a priority", () => {
    expect(homeworkRequiresAction({ homework: "", homework_posted: false })).toBe(false);
    expect(homeworkRequiresAction({ homework: "  ", homework_posted: false })).toBe(false);
    expect(homeworkRequiresAction({ homework: "Ex. 3", homework_posted: null })).toBe(false);
    expect(homeworkRequiresAction({ homework: "Ex. 3", homework_posted: false })).toBe(true);
  });
  test("lead alerts covered by a pending task are suppressed", () => {
    const out = suppressCoveredLeadItems([
      item({ id: "stale", ref: { leadId: "L1" } }),
      item({ id: "task", ref: { leadId: "L1", taskId: "T1" } }),
      item({ id: "other", ref: { leadId: "L2" } }),
    ], new Set(["L1"]));
    expect(out.map((i) => i.id)).toEqual(["task", "other"]);
  });
  test("sorts by urgency then oldest date", () => {
    const out = sortDailyPriorities([
      item({ id: "a", urgency: "today", date: "2026-10-20" }),
      item({ id: "b", urgency: "critical", date: "2026-10-10" }),
      item({ id: "c", urgency: "critical", date: "2026-09-01" }),
    ]);
    expect(out.map((i) => i.id)).toEqual(["c", "b", "a"]);
  });
});
