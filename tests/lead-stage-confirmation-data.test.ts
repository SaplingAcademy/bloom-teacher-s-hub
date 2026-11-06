import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ getUser: vi.fn(), from: vi.fn(), insert: vi.fn(), upsert: vi.fn(), eq: vi.fn(), lead: { id: "lead", teacher_id: "teacher", full_name: "Júlia", stage: "Novo contato" } as Record<string, unknown>, interactions: [] as unknown[], events: [] as unknown[], history: [] as unknown[], error: null as unknown }));
vi.mock("@/lib/supabase", () => ({ supabase: { auth: { getUser: mock.getUser }, from: mock.from } }));
import { confirmationUuid, readStageEvidence, recordConfirmedStep } from "../src/lib/lead-stage-confirmation-data";
beforeEach(() => {
  vi.clearAllMocks(); mock.interactions = []; mock.events = []; mock.history = []; mock.error = null; mock.lead = { id: "lead", teacher_id: "teacher", full_name: "Júlia", stage: "Novo contato" };
  mock.getUser.mockResolvedValue({ data: { user: { id: "teacher" } }, error: null });
  mock.from.mockImplementation((table: string) => {
    let idFilter: string | undefined, keyFilter: string | undefined;
    const rows = () => table === "lead_interactions" ? mock.interactions : table === "automation_events" ? mock.events : mock.history;
    const chain: Record<string, unknown> = { select: () => chain, order: () => chain, range: () => chain, in: () => chain,
      eq: (key: string, value: string) => { mock.eq(key, value); if (key === "id") idFilter = value; if (key === "idempotency_key") keyFilter = value; return chain; },
      insert: (payload: Record<string, unknown>) => { mock.insert(table, payload); if (!mock.error) (rows() as unknown[]).push(payload); return chain; },
      upsert: (payload: Record<string, unknown>, options: unknown) => { mock.upsert(table, payload, options); if (!mock.error && !(rows() as Record<string, unknown>[]).some((r) => payload.id ? r.id === payload.id : r.idempotency_key === payload.idempotency_key)) rows().push({ id: "event-id", ...payload }); return chain; },
      maybeSingle: async () => ({ data: table === "leads" ? mock.lead : (rows() as Record<string, unknown>[]).find((r) => keyFilter ? r.idempotency_key === keyFilter : idFilter ? r.id === idFilter : true) ?? null, error: mock.error }),
      then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: rows(), error: mock.error }).then(resolve),
    }; return chain;
  });
});
describe("Confirmed-step persistence", () => {
  it("rejects account switches before any lead read or confirmation write", async () => {
    mock.getUser.mockResolvedValue({ data: { user: { id: "other" } }, error: null }); await expect(readStageEvidence("teacher", "lead")).rejects.toThrow("authentication_changed"); await expect(recordConfirmedStep("teacher", "lead", "contact", "2026-11-01T10:00:00Z", "Contact confirmed")).rejects.toThrow("authentication_changed"); expect(mock.from).not.toHaveBeenCalled();
  });
  it("does not treat failed reads as absent prior records", async () => {
    mock.error = { message: "network" }; await expect(readStageEvidence("teacher", "lead")).rejects.toEqual(mock.error); expect(mock.insert).not.toHaveBeenCalled();
  });
  it("records first contact once with the real date, minimal fact, and no stage/task writes", async () => {
    await recordConfirmedStep("teacher", "lead", "contact", "2026-11-01T10:00:00Z", "First contact confirmed by teacher."); await recordConfirmedStep("teacher", "lead", "contact", "2026-11-01T10:00:00Z", "First contact confirmed by teacher.");
    expect(mock.insert).toHaveBeenCalledTimes(1); expect(mock.insert.mock.calls[0][1]).toMatchObject({ teacher_id: "teacher", lead_id: "lead", type: "other", occurred_at: "2026-11-01T10:00:00.000Z", description: "First contact confirmed by teacher." }); expect(mock.upsert).not.toHaveBeenCalled(); expect(mock.from.mock.calls.map(([table]) => table)).not.toContain("tasks");
  });
  it("does not duplicate canonical already-recorded contact or proposal", async () => {
    mock.lead.contacted_at = "2026-11-01T10:00:00Z"; mock.events.push({ id: "e", event_type: "lead.proposal_recorded", status: "completed" });
    await recordConfirmedStep("teacher", "lead", "contact", "2026-11-01T10:00:00Z", "Contact"); await recordConfirmedStep("teacher", "lead", "proposal", "2026-11-01T10:00:00Z", "Proposal"); expect(mock.insert).not.toHaveBeenCalled(); expect(mock.upsert).not.toHaveBeenCalled();
  });
  it("records trial confirmation in history without scheduling a lesson or creating tasks", async () => {
    await recordConfirmedStep("teacher", "lead", "trial", "2026-11-01T10:00:00Z", "Scheduling confirmed.");
    expect(mock.upsert.mock.calls[0]).toMatchObject(["automation_events", { status: "completed", event_type: "lead.stage_confirmed", payload: { step: "trial", occurred_at: "2026-11-01T10:00:00.000Z", origin: "manual_confirmation" } }]);
    expect(mock.upsert.mock.calls[1]).toMatchObject(["automation_activity", { action_type: "manual_stage_confirmation", created_at: "2026-11-01T10:00:00.000Z" }]);
    expect(mock.from.mock.calls.map(([table]) => table)).not.toContain("calendar_events"); expect(mock.from.mock.calls.map(([table]) => table)).not.toContain("tasks");
  });
  it("uses insert-if-absent on retries and retains original confirmed details", async () => {
    await recordConfirmedStep("teacher", "lead", "proposal", "2026-11-01T10:00:00Z", "Original fact"); await recordConfirmedStep("teacher", "lead", "proposal", "2026-11-02T11:00:00Z", "Retry fact");
    expect(mock.events).toHaveLength(1); expect(mock.history).toHaveLength(1); expect(mock.upsert.mock.calls.at(-1)?.[1]).toMatchObject({ description: "Original fact", created_at: "2026-11-01T10:00:00.000Z" });
    expect(mock.eq).toHaveBeenCalledWith("teacher_id", "teacher"); expect(mock.eq).toHaveBeenCalledWith("source_id", "lead");
  });
  it("UUIDs are deterministic and separate teacher/lead/step histories", async () => {
    const id = await confirmationUuid("teacher:lead:contact"); expect(await confirmationUuid("teacher:lead:contact")).toBe(id); expect(await confirmationUuid("other:lead:contact")).not.toBe(id); expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });
});