// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ rpc: vi.fn(), admin: false }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: m.rpc } }));
vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ t: (key: string) => key, lang: "pt" }) }));
vi.mock("@/hooks/use-plan", () => ({ usePlan: () => ({ isSuperAdmin: m.admin }) }));
import { AdminDiagnostics } from "../src/components/bloom/AdminDiagnostics";

let root: Root | undefined;
const q = (sel: string) => document.querySelector(sel);
const rows = [
  { teacher_id: "1", full_name: "Ana", status: "completed", current_step: 5, schema_version: 1, consent_accepted_at: "2026-11-16T10:00:00Z", started_at: "2026-11-16T09:00:00Z", updated_at: "2026-11-16T10:00:00Z", completed_at: "2026-11-16T10:00:00Z",
    answers: { experience: "3_5", pain_points: ["payments", "collections"], wish: "Mais tempo", admin_control: 6 } },
  { teacher_id: "2", full_name: "Bia", status: "in_progress", current_step: 2, schema_version: 1, consent_accepted_at: "2026-11-16T10:00:00Z", started_at: "2026-11-16T09:00:00Z", updated_at: "2026-11-16T10:00:00Z", completed_at: null, answers: {} },
];
async function mount() {
  root = createRoot(document.body.appendChild(document.createElement("div")));
  await act(async () => root!.render(createElement(QueryClientProvider, { client: new QueryClient() }, createElement(AdminDiagnostics))));
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); document.body.innerHTML = ""; m.rpc.mockReset().mockResolvedValue({ data: rows, error: null }); });
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = undefined; });

describe("Diagnósticos (admin)", () => {
  it("is hidden for regular teachers and never requests the answers", async () => {
    m.admin = false;
    await mount();
    expect(q('[data-testid="admin-diagnostics"]')).toBeNull();
    expect(m.rpc).not.toHaveBeenCalled();
  });
  it("super_admin sees totals, list, individual answers, charts, top difficulties and CSV export", async () => {
    m.admin = true;
    await mount();
    expect(m.rpc).toHaveBeenCalledWith("list_teacher_diagnostics");
    expect(q('[data-testid="diagnostics-completed"]')!.textContent).toBe("1");
    expect(q('[data-testid="diagnostics-in-progress"]')!.textContent).toBe("1");
    expect(q('[data-testid="diagnostics-list"]')!.textContent).toContain("Ana");
    expect(q('[data-testid="diagnostics-top-pains"]')!.textContent).toContain("diagnostic.q.pain_points.options.payments");
    expect(q('[data-testid="chart-experience"]')).not.toBeNull();
    const view = [...document.querySelectorAll("button")].find((b) => b.textContent?.includes("diagnostic.admin.view"))!;
    await act(async () => view.click());
    expect(q('[data-testid="diagnostic-answers"]')!.textContent).toContain("Mais tempo");
    const create = vi.fn(() => "blob:x"); const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await act(async () => (q('[data-testid="diagnostics-export"]') as HTMLButtonElement).click());
    expect(create).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
  });
});
