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
import { pendingPlanUpgrade, fetchPendingPlanUpgrade, planDisplayName, upgradeScenario } from "../src/lib/plan-upgrade";
import { PlanUpgradeCelebration } from "../src/components/bloom/PlanUpgradeCelebration";
import { t } from "../src/lib/i18n";

const DAY = 86_400;
const row = (over: Record<string, unknown> = {}) => ({
  plan: "pro", upgraded_at: "2026-11-17T12:00:00Z", upgraded_to_plan: "pro", upgrade_source: "purchase",
  upgrade_free_seconds: 2 * DAY, upgrade_student_count: 1, upgrade_acknowledged_at: null, ...over,
});

describe("event classification (pure)", () => {
  const s = (source: string, freeSeconds: number | null, studentCount: number | null) => upgradeScenario({ source: source as never, freeSeconds, studentCount });
  it("admin grant always wins, whatever the account age or students", () => {
    expect(s("admin_grant", 30 * DAY, 1)).toBe("admin_gift");
    expect(s("admin_grant", 60, 10)).toBe("admin_gift");
    expect(s("admin_grant", null, null)).toBe("admin_gift");
  });
  it("purchase after at least 24 h of effective Free comes before the early-purchase rule", () => {
    expect(s("purchase", DAY, 0)).toBe("after_free");
    expect(s("purchase", DAY - 1, 0)).toBe("early");
    expect(s("purchase", 3 * DAY, 10)).toBe("after_free");
  });
  it("purchase before 3 students (and not after 24 h on Free) is early; otherwise default", () => {
    expect(s("purchase", 3600, 2)).toBe("early");
    expect(s("purchase", 3600, 3)).toBe("default");
    expect(s("purchase", null, null)).toBe("default"); // missing facts never qualify for A or B
  });
  it("an unknown origin is never treated as a purchase", () => {
    expect(s("unknown", 30 * DAY, 0)).toBe("default");
    expect(pendingPlanUpgrade(row({ upgrade_source: "something" }))!.source).toBe("unknown");
    expect(pendingPlanUpgrade(row({ upgrade_source: null }))!.source).toBe("unknown");
  });
  it("is pending only for an unseen event whose plan is still current", () => {
    expect(pendingPlanUpgrade(row())).toMatchObject({ upgradedAt: "2026-11-17T12:00:00Z", plan: "pro", source: "purchase", freeSeconds: 2 * DAY, studentCount: 1 });
    expect(pendingPlanUpgrade(row({ upgrade_acknowledged_at: "2026-11-17T12:05:00Z" }))).toBeNull(); // already seen
    expect(pendingPlanUpgrade(row({ upgraded_at: null, upgraded_to_plan: null }))).toBeNull(); // existing PRO / created as PRO
    expect(pendingPlanUpgrade(row({ plan: "free" }))).toBeNull(); // downgraded before seeing it
  });
  it("shows the commercial name PREMIUM for the internal 'pro' plan", () => {
    const tr = (k: string) => t(k, "pt");
    expect(planDisplayName("pro", tr)).toBe("PREMIUM");
    expect(planDisplayName("elite", tr)).toBe("ELITE");
  });
  it("is silent while the manual migration is not applied, but surfaces other errors", async () => {
    m.row = null; m.error = { code: "42703", message: "column teacher_subscriptions.upgrade_source does not exist" };
    await expect(fetchPendingPlanUpgrade("t1")).resolves.toBeNull();
    m.error = { code: "500", message: "network" };
    await expect(fetchPendingPlanUpgrade("t1")).rejects.toMatchObject({ message: "network" });
    m.error = null;
  });
});

let root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  document.body.innerHTML = ""; m.rpc.mockReset(); m.rpc.mockResolvedValue({ data: true, error: null }); m.error = null; m.selects.length = 0;
  root = createRoot(document.body.appendChild(document.createElement("div")));
});
afterEach(async () => { await act(async () => root.unmount()); });
const settle = async () => { for (let i = 0; i < 10; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
const mount = async (client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) => {
  await act(async () => root.render(createElement(QueryClientProvider, { client }, createElement(PlanUpgradeCelebration, { teacherId: "t1" }))));
  await settle();
};
const modal = () => document.querySelector('[data-testid="plan-upgrade-celebration"]');

describe("welcome messages (modal)", () => {
  const cases = [
    { name: "A — upgrade after trying Free", over: { upgrade_source: "purchase", upgrade_free_seconds: 2 * DAY, upgrade_student_count: 5 }, scenario: "after_free", icon: "crown",
      title: "Você deu o próximo passo!", description: "Sua Bloom agora é PREMIUM! Não vemos a hora de ajudar seu negócio a florescer." },
    { name: "B — PREMIUM right at the start", over: { upgrade_source: "purchase", upgrade_free_seconds: 600, upgrade_student_count: 2 }, scenario: "early", icon: "crown",
      title: "Boa! Obrigada por confiar em nosso trabalho!", description: "Sua Bloom já é PREMIUM! Prepare-se para organizar suas aulas com ainda mais possibilidades." },
    { name: "C — granted by the administrator", over: { upgrade_source: "admin_grant", upgrade_free_seconds: 2 * DAY, upgrade_student_count: 1 }, scenario: "admin_gift", icon: "gift",
      title: "Você recebeu um presente nosso: agora você é PREMIUM!", description: "Sua conta foi atualizada para PREMIUM. Aproveite os recursos que acabaram de ser liberados para você!" },
    { name: "default — other purchases", over: { upgrade_source: "purchase", upgrade_free_seconds: 600, upgrade_student_count: 8 }, scenario: "default", icon: "crown",
      title: "Seu Bloom agora é PREMIUM!", description: "Você acaba de desbloquear uma nova experiência. Aproveite todos os recursos do seu novo plano!" },
  ];
  for (const c of cases) {
    it(c.name, async () => {
      m.row = row(c.over);
      await mount();
      const el = modal()!;
      expect(el.getAttribute("data-scenario")).toBe(c.scenario);
      expect(el.querySelector("h2")!.textContent).toBe(c.title);
      expect(el.querySelector("p")!.textContent).toBe(c.description);
      expect(el.textContent).toContain("UPGRADE CONCLUÍDO");
      expect(el.querySelector(`.lucide-${c.icon}`)).not.toBeNull();
      expect(el.textContent).not.toMatch(/\p{Extended_Pictographic}/u); // no emojis
      expect([...el.querySelectorAll("button")].some((b) => b.textContent === "Explorar meu Bloom")).toBe(true);
    });
  }
  it("an unknown-origin upgrade gets the default message, never a purchase one", async () => {
    m.row = row({ upgrade_source: "unknown", upgrade_free_seconds: 30 * DAY, upgrade_student_count: 0 });
    await mount();
    expect(modal()!.getAttribute("data-scenario")).toBe("default");
  });
});

describe("shown once per event", () => {
  it("'Explorar meu Bloom' acknowledges only this event and it does not come back", async () => {
    m.row = row({ upgrade_source: "admin_grant" });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await mount(client);
    expect(m.selects[0]).toContain("upgrade_source");
    m.row = row({ upgrade_source: "admin_grant", upgrade_acknowledged_at: "2026-11-17T12:01:00Z" }); // database after the ack
    await act(async () => ([...modal()!.querySelectorAll("button")].find((b) => b.textContent === "Explorar meu Bloom") as HTMLButtonElement).click());
    await settle();
    expect(m.rpc).toHaveBeenCalledTimes(1);
    expect(m.rpc).toHaveBeenCalledWith("acknowledge_plan_upgrade", { p_upgraded_at: "2026-11-17T12:00:00Z" });
    expect(modal()).toBeNull();
    // A fresh load (refresh / new login / another device) reads the acknowledged event: nothing shown.
    await act(async () => root.unmount());
    root = createRoot(document.body.appendChild(document.createElement("div")));
    await mount();
    expect(modal()).toBeNull();
    expect(m.rpc).toHaveBeenCalledTimes(1);
  });
  it("closing with Esc also acknowledges", async () => {
    m.row = row();
    await mount();
    await act(async () => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    expect(m.rpc).toHaveBeenCalledWith("acknowledge_plan_upgrade", { p_upgraded_at: "2026-11-17T12:00:00Z" });
  });
  it("shows nothing without a pending event (renewal, downgrade, existing or created-as-PRO accounts)", async () => {
    m.row = row({ upgraded_at: null, upgraded_to_plan: null, upgrade_source: null });
    await mount();
    expect(modal()).toBeNull();
    expect(m.rpc).not.toHaveBeenCalled();
  });
});
