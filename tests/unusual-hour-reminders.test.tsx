// @vitest-environment happy-dom
import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const db = vi.hoisted(() => ({
  row: { notification_preferences: { payment_methods: ["Pix"], contracts: "yes" } as any } as any,
  updates: [] as any[],
  staleOnce: false,
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: "t-1" } }, error: null }) },
    from: () => {
      let patch: any = null;
      const chain: any = {
        select: () => chain,
        update: (p: any) => { patch = p; return chain; },
        eq: () => chain,
        is: () => chain,
        maybeSingle: async () => {
          if (!patch) return { data: db.row, error: null };
          db.updates.push(patch);
          if (db.staleOnce) { db.staleOnce = false; return { data: null, error: null }; } // compare-and-set miss
          db.row = { ...db.row, ...patch };
          return { data: db.row, error: null };
        },
      };
      return chain;
    },
  },
}));
vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ lang: "pt", t: (k: string) => k }) }));
vi.mock("sonner", () => ({ toast: { warning: vi.fn(), error: vi.fn() } }));

import {
  changedRecurringStartTimes,
  mergeOnboardingNotificationPreferences,
  unusualHourGroupsFor,
  mergeUnusualHourPreference,
  parseUnusualHourPreferences,
  saveUnusualHourPreference,
  unusualHourGroup,
} from "../src/lib/unusual-hour-reminders";
import { useUnusualHourReminder } from "../src/hooks/use-unusual-hour-reminder";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
  db.row = { notification_preferences: { payment_methods: ["Pix"], contracts: "yes" } };
  db.updates = [];
});
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

describe("unusual-hour groups and preferences", () => {
  it("classifies the lesson start time with inclusive boundaries", () => {
    expect(unusualHourGroup("00:00")).toBe("early_morning");
    expect(unusualHourGroup("06:00")).toBe("early_morning");
    expect(unusualHourGroup("06:01")).toBeNull();
    expect(unusualHourGroup("21:59")).toBeNull();
    expect(unusualHourGroup("22:00")).toBe("late_night");
    expect(unusualHourGroup("23:59:00")).toBe("late_night");
    expect(unusualHourGroup("")).toBeNull();
  });

  it("groups are independent and other notification preferences are preserved", () => {
    const merged = mergeUnusualHourPreference({ payment_methods: ["Pix"], wellbeing_reminders: { late_night: false } }, "early_morning", false);
    expect(merged).toEqual({ payment_methods: ["Pix"], wellbeing_reminders: { late_night: false, early_morning: false } });
    expect(parseUnusualHourPreferences({ wellbeing_reminders: { early_morning: false } })).toEqual({ early_morning: false, late_night: true });
    expect(parseUnusualHourPreferences(null)).toEqual({ early_morning: true, late_night: true });
  });

  it("saves with compare-and-set, retrying once, without touching other keys", async () => {
    db.staleOnce = true;
    const saved = await saveUnusualHourPreference("t-1", "late_night", false);
    expect(saved).toEqual({ early_morning: true, late_night: false });
    expect(db.updates).toHaveLength(2);
    expect(db.row.notification_preferences).toEqual({ payment_methods: ["Pix"], contracts: "yes", wellbeing_reminders: { late_night: false } });
    await expect(saveUnusualHourPreference("someone-else", "late_night", false)).rejects.toThrow("authentication");
  });
});

describe("recurring schedules (Students and Classes)", () => {
  it("only new slots or slots whose day/time changed are considered", () => {
    const original = [
      { id: "a", weekday: "Monday", startTime: "23:00" },
      { id: "b", weekday: "Tuesday", startTime: "09:00" },
      { id: "c", weekday: "Friday", startTime: "18:00" },
    ];
    const next = [
      { id: "a", weekday: "Monday", startTime: "23:00" },   // unchanged late slot → no reminder
      { id: "b", weekday: "Tuesday", startTime: "05:30" },  // time changed
      { id: "c", weekday: "Saturday", startTime: "18:00" }, // day changed
      { weekday: "Sunday", startTime: "22:15" },            // new slot
    ];
    expect(changedRecurringStartTimes(original, next)).toEqual(["05:30", "18:00", "22:15"]);
    expect(changedRecurringStartTimes([], [{ weekday: "Monday", startTime: "23:00" }])).toEqual(["23:00"]);
  });

  it("several unusual times yield at most one reminder per group, in a stable order", () => {
    expect(unusualHourGroupsFor(["23:00", "22:30", "05:00", "09:00", "01:00"])).toEqual(["early_morning", "late_night"]);
    expect(unusualHourGroupsFor(["10:00", "14:00"])).toEqual([]);
  });

  it("onboarding keeps stored keys such as wellbeing_reminders while writing its own", () => {
    expect(mergeOnboardingNotificationPreferences(
      { wellbeing_reminders: { late_night: false }, payment_methods: ["Boleto"] },
      { payment_methods: ["Pix"], contracts: "yes" },
    )).toEqual({ wellbeing_reminders: { late_night: false }, payment_methods: ["Pix"], contracts: "yes" });
    expect(mergeOnboardingNotificationPreferences(null, { contracts: "no" })).toEqual({ contracts: "no" });
  });
});

// Harness: a button that asks for the reminder like the Calendar / recurring forms do before saving.
function Harness({ startTimes, onResult }: { startTimes: string[]; onResult: (ok: boolean) => void }) {
  const reminder = useUnusualHourReminder("t-1");
  const [, force] = useState(0);
  return createElement("div", null,
    createElement("button", {
      id: "save",
      onClick: async () => {
        onResult(await (startTimes.length === 1 ? reminder.confirm(startTimes[0]) : reminder.confirmMany(startTimes)));
        force((n) => n + 1);
      },
    }, "save"),
    reminder.dialog,
  );
}

function renderHarness(startTime: string | string[]) {
  const results: boolean[] = [];
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const mounted = root;
  const startTimes = Array.isArray(startTime) ? startTime : [startTime];
  act(() => mounted.render(createElement(QueryClientProvider, { client: new QueryClient() }, createElement(Harness, { startTimes, onResult: (ok) => results.push(ok) }))));
  return results;
}
const click = (el: Element | null | undefined) => act(() => (el as HTMLElement).click());
const byText = (text: string) => Array.from(document.querySelectorAll("button")).find((b) => b.textContent?.includes(text));

describe("reminder dialog before saving", () => {
  it("normal hours never show a reminder", async () => {
    const results = renderHarness("09:00");
    await flush();
    click(document.getElementById("save"));
    await flush();
    expect(results).toEqual([true]);
    expect(document.body.textContent).not.toContain("unusualHours");
  });

  it("'Alterar horário' returns without saving and does not store the preference", async () => {
    const results = renderHarness("23:00");
    await flush();
    click(document.getElementById("save"));
    expect(document.body.textContent).toContain("unusualHours.lateTitle");
    click(document.querySelector('[role="checkbox"]'));
    click(byText("unusualHours.changeTime"));
    await flush();
    expect(results).toEqual([false]);
    expect(db.updates).toEqual([]);
  });

  it("'Confirmar horário' proceeds; with 'Não mostrar novamente' only that group is disabled", async () => {
    const results = renderHarness("05:30");
    await flush();
    click(document.getElementById("save"));
    expect(document.body.textContent).toContain("unusualHours.earlyTitle");
    click(document.querySelector('[role="checkbox"]'));
    click(byText("unusualHours.confirmTime"));
    await flush();
    expect(results).toEqual([true]);
    expect(db.row.notification_preferences.wellbeing_reminders).toEqual({ early_morning: false });
    // Next attempt at an early hour: no reminder anymore.
    click(document.getElementById("save"));
    await flush();
    expect(results).toEqual([true, true]);
    expect(document.body.textContent).not.toContain("unusualHours.earlyTitle");
  });

  it("a disabled late-night reminder does not affect the early-morning one", async () => {
    db.row = { notification_preferences: { wellbeing_reminders: { late_night: false } } };
    const late = renderHarness("22:30");
    await flush();
    click(document.getElementById("save"));
    await flush();
    expect(late).toEqual([true]);
    act(() => root?.unmount());
    root = null;
    document.body.innerHTML = "";
    const early = renderHarness("01:00");
    await flush();
    click(document.getElementById("save"));
    expect(document.body.textContent).toContain("unusualHours.earlyTitle");
    click(byText("unusualHours.confirmTime"));
    await flush();
    expect(early).toEqual([true]);
    expect(db.updates).toEqual([]); // confirming without the checkbox stores nothing
  });

  it("recurring save with many unusual slots shows one reminder per group, and stops on 'Alterar horário'", async () => {
    const results = renderHarness(["23:00", "22:30", "05:00", "01:00"]);
    await flush();
    click(document.getElementById("save"));
    expect(document.body.textContent).toContain("unusualHours.earlyTitle");
    click(byText("unusualHours.confirmTime"));
    await flush();
    expect(document.body.textContent).toContain("unusualHours.lateTitle");
    click(byText("unusualHours.confirmTime"));
    await flush();
    expect(results).toEqual([true]);
    expect(document.body.textContent).not.toContain("unusualHours.lateTitle");

    click(document.getElementById("save"));
    expect(document.body.textContent).toContain("unusualHours.earlyTitle");
    click(byText("unusualHours.changeTime"));
    await flush();
    expect(results).toEqual([true, false]);
    expect(document.body.textContent).not.toContain("unusualHours.lateTitle"); // no second pop-up after declining
  });
});
