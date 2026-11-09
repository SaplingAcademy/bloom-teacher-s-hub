// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  agreementsWithScheduledRenewal,
  findChargeConflicts,
  planRenewalTiming,
  suggestFirstDueDate,
  suggestedRenewalStart,
} from "../src/lib/contract-renewal-schedule";

// ---------------------------------------------------------------------------
// In-memory Supabase (only what renewStudentPackage and its receivables use)
// ---------------------------------------------------------------------------
const db = vi.hoisted(() => ({
  tables: {} as Record<string, any[]>,
  writes: [] as string[],
  rpcCalls: [] as any[],
  rpcError: null as any,
  rpcResult: 1,
  failInsertWith: null as any,
}));

vi.mock("@/lib/supabase", () => {
  class Q {
    filters: ((r: any) => boolean)[] = []; op = "select"; payload: any; returning = false;
    constructor(public table: string) { db.tables[table] ||= []; }
    select() { if (this.op !== "select") this.returning = true; return this; }
    eq(c: string, v: any) { this.filters.push((r) => r[c] === v); return this; }
    in(c: string, v: any[]) { this.filters.push((r) => v.includes(r[c])); return this; }
    is(c: string, v: any) { this.filters.push((r) => (r[c] ?? null) === v); return this; }
    neq(c: string, v: any) { this.filters.push((r) => r[c] !== v); return this; }
    order() { return this; } limit() { return this; }
    insert(p: any) { this.op = "insert"; this.payload = p; return this; }
    update(p: any) { this.op = "update"; this.payload = p; return this; }
    delete() { this.op = "delete"; return this; }
    run() {
      const rows = () => db.tables[this.table].filter((r) => this.filters.every((f) => f(r)));
      if (this.op === "insert") {
        if (this.table === "student_packages" && db.failInsertWith) return { data: null, error: db.failInsertWith };
        const list = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((r: any, i: number) => ({ id: `${this.table}-${db.tables[this.table].length + i + 1}`, ...r }));
        db.tables[this.table].push(...list); db.writes.push(`insert:${this.table}`);
        return { data: this.returning ? list : null, error: null };
      }
      if (this.op === "update") { const hit = rows(); hit.forEach((r) => Object.assign(r, this.payload)); db.writes.push(`update:${this.table}`); return { data: hit, error: null }; }
      if (this.op === "delete") { const hit = new Set(rows()); db.tables[this.table] = db.tables[this.table].filter((r) => !hit.has(r)); db.writes.push(`delete:${this.table}`); return { data: null, error: null }; }
      return { data: rows(), error: null };
    }
    async single() { const { data, error } = this.run(); return error ? { data: null, error } : { data: (data as any[])[0] ?? null, error: (data as any[]).length ? null : { message: "not found" } }; }
    async maybeSingle() { const { data, error } = this.run(); return error ? { data: null, error } : { data: (data as any[])[0] ?? null, error: null }; }
    then(res: any, rej: any) { return Promise.resolve(this.run()).then(res, rej); }
  }
  return {
    supabase: {
      from: (t: string) => new Q(t),
      rpc: async (name: string, args?: any) => { db.rpcCalls.push({ name, args }); return db.rpcError ? { data: null, error: db.rpcError } : { data: db.rpcCalls.length > 1 ? db.rpcResult : 0, error: null }; },
    },
  };
});

import { renewStudentPackage } from "../src/lib/finance-engine";
import { buildContractItems } from "../src/lib/daily-priorities";

const ymd = (offset: number) => { const d = new Date(); d.setDate(d.getDate() + offset); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const PKG = { id: "pkg", name: "Intensivo", price: 350, frequency: "Monthly", billing_model: "monthly", billing_duration_type: "fixed", contract_duration_months: 6 };

function seed(current: Record<string, any> | null, invoices: any[] = []) {
  db.tables = {
    packages: [PKG],
    students: [{ id: "s1", full_name: "Ana", type: "Individual" }],
    student_packages: current ? [{ id: "cur", teacher_id: "t", student_id: "s1", package_id: "pkg", status: "active", started_at: ymd(-150), ...current }] : [],
    invoices,
  };
  db.writes = []; db.rpcCalls = []; db.rpcError = null; db.rpcResult = 1; db.failInsertWith = null;
}
const renew = (over: Record<string, any> = {}) => renewStudentPackage({
  teacherId: "t", studentId: "s1", newPackageId: "pkg", isSamePackage: true, startDate: ymd(17), firstDueDate: ymd(30),
  totalAmountCents: 35000, dueDay: 10, billingDurationType: "fixed", contractMonths: 6, ...over,
});

describe("scheduled renewal rules (pure)", () => {
  it("suggests the start the day after the current end and the first due day on/after it", () => {
    expect(suggestedRenewalStart("2026-11-25")).toBe("2026-11-26");
    expect(suggestedRenewalStart(null)).toBeNull();
    expect(suggestFirstDueDate("2026-11-26", 10)).toBe("2026-12-10");
    expect(suggestFirstDueDate("2026-11-05", 10)).toBe("2026-11-10");
    expect(suggestFirstDueDate("2026-11-10", 10)).toBe("2026-11-10");
    expect(suggestFirstDueDate("2027-01-31", 31)).toBe("2027-01-31");
    expect(suggestFirstDueDate("2027-02-01", 31)).toBe("2027-02-28"); // short month clamps
    expect(suggestFirstDueDate("2026-11-26", null)).toBeNull();
  });

  it("schedules whenever a contract is in force, never overlapping it", () => {
    expect(planRenewalTiming({ hasCurrent: false, startDate: "2026-11-26", today: "2026-11-09" })).toMatchObject({ mode: "immediate", error: null });
    expect(planRenewalTiming({ hasCurrent: true, currentEnd: "2026-11-25", startDate: "2026-11-26", today: "2026-11-09" })).toEqual({ mode: "scheduled", activateNow: false, error: null });
    expect(planRenewalTiming({ hasCurrent: true, currentEnd: "2026-11-25", startDate: "2026-11-25", today: "2026-11-09" }).error).toBe("start_before_current_end");
    expect(planRenewalTiming({ hasCurrent: true, currentStart: "2026-06-01", startDate: "2026-11-09", today: "2026-11-09" })).toEqual({ mode: "scheduled", activateNow: true, error: null });
  });

  it("flags only open charges of the current contract on/after the new start", () => {
    const found = findChargeConflicts([
      { id: "a", due_date: "2026-11-10", amount_cents: 1, status: "pending" },
      { id: "b", due_date: "2026-12-10", amount_cents: 1, status: "overdue" },
      { id: "c", due_date: "2026-12-10", amount_cents: 1, status: "paid" },
    ], "2026-11-26");
    expect(found.map((c) => c.id)).toEqual(["b"]);
    expect(agreementsWithScheduledRenewal([{ status: "scheduled", renewed_from_id: "cur" }, { status: "active" }])).toEqual(new Set(["cur"]));
  });
});

describe("renewStudentPackage with a contract in force", () => {
  beforeEach(() => seed({ last_due_date: ymd(16), billing_model: "monthly", billing_duration_type: "fixed" }));

  it("fixed contract: stores the new one as scheduled, keeps the current contract and its charges untouched", async () => {
    db.tables.invoices.push({ id: "old-6", teacher_id: "t", student_id: "s1", student_package_id: "cur", charge_kind: "monthly", sequence_number: 6, due_date: ymd(10), amount_cents: 35000, status: "pending" });
    const res = await renew();
    expect(res).toMatchObject({ success: true, scheduled: true, activated: false });
    const created = db.tables.student_packages.find((r) => r.id !== "cur")!;
    expect(created).toMatchObject({ status: "scheduled", started_at: ymd(17), first_due_date: ymd(30), renewed_from_id: "cur", due_day: 10 });
    expect(db.tables.student_packages.find((r) => r.id === "cur")).toMatchObject({ status: "active", last_due_date: ymd(16) });
    expect(db.tables.student_packages.find((r) => r.id === "cur")!.ended_at).toBeUndefined();
    expect(db.tables.invoices.find((i) => i.id === "old-6")).toMatchObject({ status: "pending", due_date: ymd(10) });
    // New charges come from first_due_date, not from the start, and none duplicate the old contract.
    const fresh = db.tables.invoices.filter((i) => i.student_package_id === created.id);
    expect(fresh).toHaveLength(6);
    expect(fresh[0].due_date >= ymd(30)).toBe(true);
    expect(db.writes.filter((w) => w === "update:student_packages" || w === "update:students")).toEqual([]);
  });

  it("refuses a start that overlaps the current contract", async () => {
    expect(await renew({ startDate: ymd(16) })).toMatchObject({ success: false, code: "invalid_start" });
    expect(db.writes).toEqual([]);
  });

  it("blocks a second scheduled renewal (existing row or concurrent unique-index rejection)", async () => {
    db.tables.student_packages.push({ id: "sch", teacher_id: "t", student_id: "s1", status: "scheduled", started_at: ymd(17) });
    expect(await renew()).toMatchObject({ success: false, code: "already_scheduled" });
    db.tables.student_packages = db.tables.student_packages.filter((r) => r.id !== "sch");
    db.failInsertWith = { code: "23505", message: "duplicate key value violates unique constraint \"idx_student_packages_scheduled_renewal\"" };
    expect(await renew()).toMatchObject({ success: false, code: "already_scheduled" });
    expect(db.tables.invoices).toHaveLength(0); // no charges generated for a rejected duplicate
  });

  it("does not schedule while the activation RPC is unavailable (migration not applied)", async () => {
    db.rpcError = { code: "PGRST202", message: "Could not find the function" };
    expect(await renew()).toMatchObject({ success: false, code: "scheduling_unavailable" });
    expect(db.writes).toEqual([]);
  });
});

describe("renewStudentPackage with a continuous contract", () => {
  beforeEach(() => seed({ last_due_date: null, ended_at: null, billing_model: "monthly", billing_duration_type: "continuous" }));

  it("asks for a decision on open charges after the transition date, then keeps them unchanged", async () => {
    db.tables.invoices.push({ id: "old-next", teacher_id: "t", student_id: "s1", student_package_id: "cur", charge_kind: "monthly", sequence_number: 1, due_date: ymd(20), amount_cents: 25000, status: "pending" });
    const blocked = await renew({ startDate: ymd(15), firstDueDate: ymd(25) });
    expect(blocked).toMatchObject({ success: false, code: "charge_conflicts" });
    expect(blocked.conflicts?.map((c) => c.id)).toEqual(["old-next"]);
    expect(db.writes).toEqual([]);

    const res = await renew({ startDate: ymd(15), firstDueDate: ymd(25), acknowledgeChargeConflicts: true });
    expect(res).toMatchObject({ success: true, scheduled: true });
    expect(db.tables.invoices.find((i) => i.id === "old-next")).toMatchObject({ status: "pending", due_date: ymd(20) });
    expect(db.tables.student_packages.find((r) => r.id === "cur")).toMatchObject({ status: "active" });
  });

  it("a transition date already due is activated right away through the same RPC", async () => {
    const res = await renew({ startDate: ymd(0), firstDueDate: ymd(5) });
    expect(res).toMatchObject({ success: true, scheduled: true, activated: true });
    // Availability check + activation: both without a client-controlled date.
    expect(db.rpcCalls).toEqual([
      { name: "activate_due_scheduled_contracts", args: undefined },
      { name: "activate_due_scheduled_contracts", args: undefined },
    ]);
  });
});

describe("renewal alerts recognize scheduled renewals", () => {
  it("no alert for a contract with a scheduled renewal; scheduled rows never alert", () => {
    const today = ymd(0);
    const student = { full_name: "Ana", status: "Active" };
    const rows = [
      { id: "cur", student_id: "s1", status: "active", ended_at: ymd(20), student },
      { id: "next", student_id: "s1", status: "scheduled", renewed_from_id: "cur", ended_at: ymd(25), student },
      { id: "other", student_id: "s2", status: "active", ended_at: ymd(20), student },
    ];
    expect(buildContractItems(rows, today).map((i) => i.ref.studentPackageId)).toEqual(["other"]);
  });
});

// ---------------------------------------------------------------------------
// Modal: continuous contract requires choosing and confirming the transition date
// ---------------------------------------------------------------------------
vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ lang: "pt", formatStatus: (s: string) => s, t: (k: string) => k }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

describe("PackageRenewalModal — continuous contract transition", () => {
  let root: Root | null = null;
  afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ""; });

  it("needs a transition date and the explicit end confirmation before continuing", async () => {
    seed({ last_due_date: null, billing_model: "monthly", billing_duration_type: "continuous" });
    const { PackageRenewalModal } = await import("../src/components/bloom/PackageRenewalModal");
    const summary: any = {
      studentId: "s1", hasActiveAgreement: true, packageId: "pkg", packageName: "Intensivo", isInstallment: false,
      totalAmountCents: 25000, installmentAmountCents: 25000, installmentCount: 1, nextDueDate: ymd(20),
      billingModel: "monthly", billingDurationType: "continuous", contractMonths: null, agreementEndDate: null, agreementId: "cur", scheduledRenewalStart: null,
    };
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const mounted = root;
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    act(() => mounted.render(createElement(PackageRenewalModal, { isOpen: true, onClose: () => {}, teacherId: "t", studentId: "s1", studentName: "Ana", currentSummary: summary })));
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    const button = (text: string) => Array.from(document.querySelectorAll("button")).find((b) => b.textContent?.includes(text)) as HTMLButtonElement;
    act(() => button("packageRenewal.continue").click());
    expect(document.body.textContent).toContain("packageRenewal.transitionTitle");
    expect(button("packageRenewal.transitionConfirm").disabled).toBe(true);

    const date = document.querySelector<HTMLInputElement>("#renewal-transition-date")!;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    act(() => { setter.call(date, ymd(15)); date.dispatchEvent(new Event("input", { bubbles: true })); });
    expect(button("packageRenewal.transitionConfirm").disabled).toBe(true); // end not confirmed yet
    act(() => (document.querySelector('[role="checkbox"]') as HTMLElement).click());
    expect(button("packageRenewal.transitionConfirm").disabled).toBe(false);
    act(() => button("packageRenewal.transitionConfirm").click());
    expect(document.body.textContent).toContain("packageRenewal.lHowWouldYouLikeToContinue"); // step 2
  });
});
