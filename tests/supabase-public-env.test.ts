import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn(), from: vi.fn(), createClient: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => {
    mocks.createClient(...args);
    return { auth: { getUser: mocks.getUser }, rpc: mocks.rpc, from: mocks.from };
  },
}));
import { readPublicSupabaseEnv } from "@/lib/supabase-public-env";
import { authorizeAcademy } from "@/lib/academy-access.server";
import { handleLibraryContent } from "@/lib/library-content.server";

const ALL = [
  "BLOOM_SUPABASE_URL", "VITE_SUPABASE_URL", "SUPABASE_URL",
  "BLOOM_SUPABASE_PUBLISHABLE_KEY", "BLOOM_SUPABASE_ANON_KEY", "VITE_SUPABASE_PUBLISHABLE_KEY",
  "VITE_SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_ANON_KEY",
];
const clearAll = () => ALL.forEach((name) => vi.stubEnv(name, ""));
// The Vercel production case: only the VITE_* names are defined.
const onlyVite = () => {
  clearAll();
  vi.stubEnv("VITE_SUPABASE_URL", "https://vite-only.invalid/rest/v1/");
  vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "vite-publishable-key");
};

beforeEach(() => {
  mocks.getUser.mockReset().mockResolvedValue({ data: { user: { id: "teacher-test" } }, error: null });
  mocks.rpc.mockReset().mockResolvedValue({ data: false, error: null });
  mocks.from.mockReset();
  mocks.createClient.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

describe("one reader for the public Supabase settings", () => {
  it("accepts BLOOM_*, then VITE_*, then SUPABASE_* (same order as the browser config)", () => {
    expect(readPublicSupabaseEnv({ VITE_SUPABASE_URL: "https://a.invalid", BLOOM_SUPABASE_URL: "https://b.invalid", SUPABASE_URL: "https://c.invalid" }).url).toBe("https://b.invalid");
    expect(readPublicSupabaseEnv({ VITE_SUPABASE_URL: "https://a.invalid", SUPABASE_URL: "https://c.invalid" }).url).toBe("https://a.invalid");
    expect(readPublicSupabaseEnv({ VITE_SUPABASE_ANON_KEY: "anon", SUPABASE_PUBLISHABLE_KEY: "pub" }).publishableKey).toBe("anon");
    expect(readPublicSupabaseEnv({ SUPABASE_URL: "https://x.supabase.co/rest/v1/" }).url).toBe("https://x.supabase.co");
    expect(readPublicSupabaseEnv({ BLOOM_SUPABASE_URL: "  ", VITE_SUPABASE_URL: "https://v.invalid" }).url).toBe("https://v.invalid");
    expect(readPublicSupabaseEnv({})).toEqual({ url: null, publishableKey: null });
  });
});

describe("Academy with the Vercel variable names", () => {
  it("only VITE_* defined: no longer ACADEMY_ACCESS_UNAVAILABLE; identity and role are still checked in the database", async () => {
    onlyVite();
    await expect(authorizeAcademy("Bearer test-only-token")).resolves.toMatchObject({ state: expect.any(String) });
    expect(mocks.createClient).toHaveBeenCalledWith("https://vite-only.invalid", "vite-publishable-key", expect.anything());
    expect(mocks.getUser).toHaveBeenCalledWith("test-only-token");
    expect(mocks.rpc).toHaveBeenCalledWith("has_role", { _user_id: "teacher-test", _role: "super_admin" });
  });
  it("an invalid token is still refused (authorization unchanged)", async () => {
    onlyVite();
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { message: "invalid" } });
    await expect(authorizeAcademy("Bearer sonda-invalida")).rejects.toThrow("ACADEMY_AUTH_REQUIRED");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("nothing configured: fails closed before any network call and logs only the expected names", async () => {
    clearAll();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(authorizeAcademy("Bearer test-only-token")).rejects.toThrow("ACADEMY_ACCESS_UNAVAILABLE");
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(String(log.mock.calls[0][0])).toContain("[academy]");
    expect(JSON.stringify(log.mock.calls[0][1])).toContain("VITE_SUPABASE_URL");
    log.mockRestore();
  });
});

describe("Library with the Vercel variable names", () => {
  it("only VITE_* defined: reaches the database access check instead of LIBRARY_CONFIGURATION_UNAVAILABLE", async () => {
    onlyVite();
    mocks.rpc.mockResolvedValue({ data: "free", error: null });
    await expect(handleLibraryContent({ accessToken: "test-only-token", resourceId: "ped-placement-test", operation: "open" }))
      .resolves.toMatchObject({ accessLevel: "free" });
    expect(mocks.rpc).toHaveBeenCalledWith("assert_library_resource_access", { _resource_id: "ped-placement-test" });
  });
});
