import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc, from: mocks.from } }));
import {
  cancelContactRequest, contactErrorCode, cooldownDaysLeft, listMyContacts, normalizeContactQuery, removeContact,
  respondContactRequest, searchTeachers, sendContactRequest,
} from "../src/lib/teacher-contacts";

beforeEach(() => { vi.clearAllMocks(); mocks.rpc.mockResolvedValue({ data: [], error: null }); });

describe("Meus Contatos data access", () => {
  it("uses only the existing RPCs, never tables, and never sends the caller's own id", async () => {
    await searchTeachers("Ana");
    await listMyContacts();
    mocks.rpc.mockResolvedValueOnce({ data: [{ request_id: "r", relation: "outgoing", cooldown_until: null }], error: null });
    expect(await sendContactRequest("t2")).toEqual({ request_id: "r", relation: "outgoing", cooldown_until: null });
    await respondContactRequest("r", true);
    await respondContactRequest("r", false);
    await cancelContactRequest("r");
    await removeContact("t2");
    expect(mocks.rpc.mock.calls).toEqual([
      ["search_teachers", { p_query: "Ana" }],
      ["list_my_contacts"],
      ["send_contact_request", { p_addressee: "t2" }],
      ["respond_contact_request", { p_request_id: "r", p_accept: true }],
      ["respond_contact_request", { p_request_id: "r", p_accept: false }],
      ["cancel_contact_request", { p_request_id: "r" }],
      ["remove_contact", { p_other: "t2" }],
    ]);
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("propagates RPC errors and maps the database markers", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "contact_pending_limit" } });
    const error = await sendContactRequest("t2").catch((e) => e);
    expect(contactErrorCode(error)).toBe("contact_pending_limit");
    expect(contactErrorCode({ message: "contact_request_not_found" })).toBe("contact_request_not_found");
    expect(contactErrorCode(new Error("network down"))).toBe("unknown");
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    await expect(listMyContacts()).rejects.toEqual({ message: "boom" });
  });
  it("searches only names with 3+ characters or complete e-mails", () => {
    expect(normalizeContactQuery("  An ")).toBeNull();
    expect(normalizeContactQuery("Ana")).toBe("Ana");
    expect(normalizeContactQuery("ana@")).toBeNull();
    expect(normalizeContactQuery("ana@escola")).toBeNull();
    expect(normalizeContactQuery(" Ana@Escola.com ")).toBe("ana@escola.com");
    expect(normalizeContactQuery("x".repeat(201))).toBeNull();
  });
  it("shows whole remaining cooldown days, rounded up", () => {
    const now = new Date("2026-11-14T12:00:00Z");
    expect(cooldownDaysLeft("2026-11-19T12:00:00Z", now)).toBe(5);
    expect(cooldownDaysLeft("2026-11-16T13:00:00Z", now)).toBe(3);
    expect(cooldownDaysLeft("2026-11-14T13:00:00Z", now)).toBe(1);
    expect(cooldownDaysLeft("2026-11-14T11:00:00Z", now)).toBe(0);
    expect(cooldownDaysLeft(null, now)).toBe(0);
  });
});
