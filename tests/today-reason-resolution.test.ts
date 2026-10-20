import { describe, expect, test } from "bun:test";
import { t, translations, type Language } from "../src/lib/i18n";

const placeholders = {
  attendance_missing: ["date", "time", "daysLate"],
  payment_overdue: ["amount", "dueDate", "daysLate"],
  payment_due_today: ["amount"],
  payment_reminder: ["amount", "dueDate"],
  contract_ended: ["packageName", "endDate"],
  contract_ending_15d: ["packageName", "daysRemaining"],
  contract_ending_30d: ["packageName", "daysRemaining"],
  homework_not_posted: ["date"],
  task_overdue: ["dueDate"], task_due_today: [],
  lead_task_overdue: ["dueDate"], lead_task_due_today: [],
  lead_trial_soon: ["date", "time"],
  lead_proposal_pending: ["since"], lead_stale: ["days"],
};

describe("Today reason resolution preserves interpolation", () => {
  for (const lang of ["pt", "en"] as Language[]) {
    test(`${lang} resolves every nested priority reason without fallback`, () => {
      const today = translations[lang].today;
      if (typeof today === "string") throw new Error("Today must be a dictionary");
      const reasons = today.reason;
      if (!reasons || typeof reasons === "string") throw new Error("Reasons must be nested");
      expect(Object.keys(reasons).sort()).toEqual(Object.keys(placeholders).sort());
      for (const [reason, params] of Object.entries(placeholders)) {
        const key = `today.reason.${reason}`;
        const resolved = t(key, lang, "__missing__");
        expect(resolved).not.toBe("__missing__");
        expect(resolved).not.toBe(key);
        expect(resolved).toBe(reasons[reason]);
        expect([...resolved.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()).toEqual([...params].sort());
      }
    });
  }
});