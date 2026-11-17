// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ row: null as any, error: null as any, rpc: vi.fn(), selects: [] as string[] }));
vi.mock("@/lib/supabase", () => ({ supabase: {
  from: () => {
    const chain: Record<string, unknown> = {};
    chain.select = (cols: string) => { m.selects.push(cols); return chain; };
    chain.eq = () => chain;
    chain.maybeSingle = async () => ({ data: m.row, error: m.error });
    return chain;
  },
  rpc: m.rpc,
} }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "t1" }, session: { user: { id: "t1" } }, loading: false }) }));
vi.mock("@/hooks/use-language", async () => {
  const { t } = await import("../src/lib/i18n");
  return { useLanguage: () => ({ t: (k: string, f?: string) => t(k, "pt", f), lang: "pt" }) };
});
import { pendingPlanUpgrade, fetchPendingPlanUpgrade, planDisplayName } from "../src/lib/plan-upgrade";
import { PlanUpgradeCelebration } from "../src/components/bloom/PlanUpgradeCelebration";
import { t } from "../src/lib/i18n";

const event = { plan: "pro", upgraded_at: "2026-11-17T12:00:00Z", upgraded_to_plan: "pro", upgrade_acknowledged_at: null };

describe("plan upgrade rule (pure)", () => {
  it("is pending only for an unseen event whose plan is still current", () => {
    expect(pendingPlanUpgrade(event)).toEqual({ upgradedAt: event.upgraded_at, plan: "pro" });
    expect(pendingPlanUpgrade({ ...event, upgrade_acknowledged_at: "2026-11-17T12:05:00Z" })).toBeNull(); // already seen
    expect(pendingPlanUpgrade({ ...event, upgraded_at: null, upgraded_to_plan: null })).toBeNull(); // existing PRO / created as PRO
    expect(pendingPlanUpgrade({ ...event, plan: "free" })).toBeNull(); // downgraded before seeing it
    expect(pendingPlanUpgrade(null)).toBeNull();
  });
  it("is silent while the manual migration is not applied (missing columns), but surfaces other errors", async () => {
    m.row = null; m.error = { code: "42703", message: 'column teacher_subscriptions.upgraded_at does not exist' };
    await expect(fetchPendingPlanUpgrade("t1")).resolves.toBeNull();
    m.error = { code: "500", message: "network" };
    await expect(fetchPendingPlanUpgrade("t1")).rejects.toMatchObject({ message: "network" });
    m.error = null;
  });
  it("uses the received plan's name dynamically", () => {
    const tr = (k: string) => t(k, "pt");
    expect(planDisplayName("pro", tr)).toBe("PRO");
    expect(planDisplayName("elite", tr)).toBe("ELITE");
  });
});

let root: Root;
let client: QueryClient;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  document.body.innerHTML = ""; m.rpc.mockReset(); m.rpc.mockResolvedValue({ data: true, error: null }); m.error = null; m.selects.length = 0;
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  root = createRoot(document.body.appendChild(document.createElement("div")));
});
afterEach(async () => { await act(async () => root.unmount()); });
const mount = async () => {
  await act(async () => root.render(createElement(QueryClientProvider, { client }, createElement(PlanUpgradeCelebration, { teacherId: "t1" }))));
  for (let i = 0; i < 10; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
};
const modal = () => document.querySelector('[data-testid="plan-upgrade-celebration"]');

describe("plan upgrade celebration modal", () => {
  it("shows the celebration with the plan name and acknowledges only this event on 'Explorar meu Bloom'", async () => {
    m.row = event;
    await mount();
    expect(modal()).not.toBeNull();
    expect(modal()!.textContent).toContain("UPGRADE CONCLUÍDO");
    expect(modal()!.querySelector("h2")!.textContent).toBe("Seu Bloom agora é PRO!");
    expect(modal()!.textContent).toContain("Você acaba de desbloquear uma nova experiência. Aproveite todos os recursos do seu novo plano!");
    expect(modal()!.querySelector(".lucide-crown")).not.toBeNull();
    expect(m.selects[0]).toContain("upgraded_at");
    m.row = { ...event, upgrade_acknowledged_at: "2026-11-17T12:01:00Z" }; // what the database returns after the ack
    const button = [...modal()!.querySelectorAll("button")].find((b) => b.textContent === "Explorar meu Bloom")!;
    await act(async () => button.click());
    for (let i = 0; i < 10; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(m.rpc).toHaveBeenCalledWith("acknowledge_plan_upgrade", { p_upgraded_at: event.upgraded_at });
    expect(m.rpc).toHaveBeenCalledTimes(1);
    expect(modal()).toBeNull();
  });
  it("closing with Esc also acknowledges (shown once per event)", async () => {
    m.row = event;
    await mount();
    await act(async () => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    expect(m.rpc).toHaveBeenCalledWith("acknowledge_plan_upgrade", { p_upgraded_at: event.upgraded_at });
  });
  it("shows nothing without a pending event (already seen, existing PRO, or not deployed)", async () => {
    m.row = { ...event, upgrade_acknowledged_at: "2026-11-17T12:01:00Z" };
    await mount();
    expect(modal()).toBeNull();
    expect(m.rpc).not.toHaveBeenCalled();
  });
});
