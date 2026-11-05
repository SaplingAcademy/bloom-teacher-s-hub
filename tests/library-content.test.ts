import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc }) }));
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => ({ inputValidator: () => ({ handler: (fn: unknown) => fn }) }) }));
import { accessLibraryResource } from "@/lib/library-content.functions";
// The transform is replaced only in this test; exercise the real handler.
const access = accessLibraryResource as unknown as (input: { data: Record<string, unknown> }) => Promise<{ rendered: string | null; template: { content: string } | null }>;
const request = { accessToken: "test-only-not-a-real-token", resourceId: "admin-student-contract", operation: "open" };

beforeEach(() => {
  vi.stubEnv("BLOOM_SUPABASE_URL", "https://test.invalid");
  vi.stubEnv("BLOOM_SUPABASE_PUBLISHABLE_KEY", "test-publishable");
  mocks.getUser.mockReset().mockResolvedValue({ data: { user: { id: "teacher-test" } }, error: null });
  mocks.rpc.mockReset().mockResolvedValue({ data: "free", error: null });
});
describe("Actual Library access boundary", () => {
  it("rejects unauthenticated direct calls before reading content", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { message: "invalid" } });
    await expect(access({ data: request })).rejects.toThrow("LIBRARY_AUTH_REQUIRED");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("rejects Premium preview and generation when the database denies", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "LIBRARY_PREMIUM_REQUIRED" } });
    await expect(access({ data: request })).rejects.toThrow("LIBRARY_PREMIUM_REQUIRED");
    await expect(access({ data: { ...request, operation: "generate", customContent: "previous copy" } })).rejects.toThrow("LIBRARY_PREMIUM_REQUIRED");
  });
  it("does not return content when classification fails", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "permissions unavailable" } });
    await expect(access({ data: request })).rejects.toThrow("permissions unavailable");
  });
  it("opens confirmed Free resources without a separate frontend classification read", async () => {
    const result = await access({ data: request });
    expect(result.template?.content).toContain("CLASS TUITION & TERMS AGREEMENT");
    expect(mocks.rpc).toHaveBeenCalledWith("assert_library_resource_access", { _resource_id: "admin-student-contract" });
  });
  it("reauthorizes every generation and uses entered fields", async () => {
    const result = await access({ data: { ...request, operation: "generate", fields: { "Student Name": "Ana" } } });
    expect(result.rendered).toContain('Ana (the "Student")');
    expect(result.rendered).not.toContain("[Student Name]");
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it("rejects unknown authoritative responses instead of silently assuming Free", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    await expect(access({ data: request })).rejects.toThrow("LIBRARY_ACCESS_UNAVAILABLE");
  });
});