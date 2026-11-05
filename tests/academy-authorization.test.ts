import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn(), from: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc, from: mocks.from }),
}));
import { authorizeAcademy } from "@/lib/academy-access.server";

beforeEach(() => {
  vi.stubEnv("BLOOM_SUPABASE_URL", "https://academy-test.invalid");
  vi.stubEnv("BLOOM_SUPABASE_PUBLISHABLE_KEY", "test-publishable-key");
  mocks.getUser.mockReset().mockResolvedValue({ data: { user: { id: "teacher-test" } }, error: null });
  mocks.rpc.mockReset().mockResolvedValue({ data: false, error: null });
  mocks.from.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

describe("Academy server authorization", () => {
  it("rejects unauthenticated direct calls before role or content reads", async () => {
    await expect(authorizeAcademy(undefined)).rejects.toThrow("ACADEMY_AUTH_REQUIRED");
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("rejects expired or invalid sessions before role reads", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { message: "expired" } });
    await expect(authorizeAcademy("Bearer test-only-token")).rejects.toThrow("ACADEMY_AUTH_REQUIRED");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("checks has_role only for the server-validated identity", async () => {
    await authorizeAcademy("Bearer test-only-token");
    expect(mocks.rpc).toHaveBeenCalledWith("has_role", { _user_id: "teacher-test", _role: "super_admin" });
  });
  it("returns Coming Soon without private content reads to non-admin teachers", async () => {
    expect(await authorizeAcademy("Bearer test-only-token")).toEqual({ state: "coming_soon", published: false });
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("returns the construction state only after the database confirms super_admin", async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    expect(await authorizeAcademy("Bearer test-only-token")).toEqual({ state: "construction", published: false });
  });
  it("fails closed on role read failures without accessing any internal data", async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: { message: "unavailable" } });
    await expect(authorizeAcademy("Bearer test-only-token")).rejects.toThrow("ACADEMY_ACCESS_UNAVAILABLE");
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("never interprets unknown or string role results as admin", async () => {
    mocks.rpc.mockResolvedValue({ data: "true", error: null });
    await expect(authorizeAcademy("Bearer test-only-token")).rejects.toThrow("ACADEMY_ACCESS_UNAVAILABLE");
  });
  it("revalidates the database role on every call, including revocation", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: true, error: null }).mockResolvedValueOnce({ data: false, error: null });
    expect((await authorizeAcademy("Bearer test-only-token")).state).toBe("construction");
    expect((await authorizeAcademy("Bearer test-only-token")).state).toBe("coming_soon");
    expect(mocks.getUser).toHaveBeenCalledTimes(2);
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
  });
});