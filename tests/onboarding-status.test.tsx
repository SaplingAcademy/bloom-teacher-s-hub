// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

/* ── Mocked Supabase (auth events + profiles / onboarding reads) ─────────────────────────── */
const sb = vi.hoisted(() => ({
  session: null as any,
  listeners: [] as ((event: string, session: any) => void)[],
  profile: { data: null as any, error: null as any },
  onboarding: { data: null as any, error: null as any },
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: sb.session } }),
      onAuthStateChange: (cb: (event: string, session: any) => void) => {
        sb.listeners.push(cb);
        return { data: { subscription: { unsubscribe: () => { sb.listeners = sb.listeners.filter((l) => l !== cb); } } } };
      },
      signOut: async () => { sb.session = null; sb.listeners.forEach((l) => l("SIGNED_OUT", null)); return { error: null }; },
    },
    from: (table: string) => {
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => (table === "profiles" ? sb.profile : sb.onboarding),
      };
      return chain;
    },
  },
}));

import { AuthProvider, useAuth } from "../src/hooks/use-auth";
import { onboardingGate, postLoginDestination } from "../src/lib/onboarding-status";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
let latest: ReturnType<typeof useAuth> | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  latest = null;
  sb.session = null;
  sb.listeners = [];
  sb.profile = { data: null, error: null };
  sb.onboarding = { data: null, error: null };
  localStorage.clear();
  vi.restoreAllMocks();
});

const flush = () => act(async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); });
const userSession = { user: { id: "t-1", email: "prof@escola.com", user_metadata: {} } };
const profileRow = (completed: boolean) => ({ id: "t-1", full_name: "Ana Lima", onboarding_completed: completed, locale: "pt-BR" });

function Probe() {
  latest = useAuth();
  return null;
}
async function mount() {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(createElement(AuthProvider, null, createElement(Probe))));
  await flush();
}
const gateNow = () => onboardingGate({ loading: latest!.loading, error: latest!.error, profile: latest!.profile });

describe("onboarding gate (pure)", () => {
  it("never decides before the profile is loaded, and never maps an error to pending/completed", () => {
    expect(onboardingGate({ loading: true, error: null, profile: null })).toBe("loading");
    expect(onboardingGate({ loading: false, error: null, profile: null })).toBe("loading");
    expect(onboardingGate({ loading: false, error: new Error("x"), profile: null })).toBe("error");
    expect(onboardingGate({ loading: false, error: null, profile: { onboarding_completed: true } })).toBe("completed");
    expect(onboardingGate({ loading: false, error: null, profile: { onboarding_completed: false, onboarding_status: "skipped" } })).toBe("skipped");
    expect(onboardingGate({ loading: false, error: null, profile: { onboarding_completed: false, onboarding_status: "in_progress" } })).toBe("pending");
    expect(postLoginDestination("loading")).toBeNull();
    expect(postLoginDestination("pending")).toBe("/onboarding");
    for (const g of ["completed", "skipped", "error"] as const) expect(postLoginDestination(g)).toBe("/");
  });

  it("ignores browser storage: a stale local flag never marks the setup as completed", () => {
    localStorage.setItem("bloom.onboarding.completed", "true");
    expect(onboardingGate({ loading: false, error: null, profile: { onboarding_completed: false } })).toBe("pending");
  });
});

describe("AuthProvider onboarding status from Supabase", () => {
  it("completed teacher: logout and login again keeps the status (local storage purged on logout)", async () => {
    sb.session = userSession;
    sb.profile = { data: profileRow(true), error: null };
    sb.onboarding = { data: { answers: { status: "completed" } }, error: null };
    await mount();
    expect(gateNow()).toBe("completed");

    await act(async () => { await latest!.signOut(); });
    await flush();
    expect(latest!.user).toBeNull();
    expect(localStorage.getItem("bloom.onboarding.completed")).toBeNull(); // purged on logout

    // New login: right after the auth event the profile is not loaded yet → "loading", never "pending".
    sb.session = userSession;
    act(() => sb.listeners.forEach((l) => l("SIGNED_IN", userSession)));
    expect(gateNow()).toBe("loading");
    await flush();
    expect(gateNow()).toBe("completed");
    expect(postLoginDestination(gateNow())).toBe("/");
  });

  it("completion recorded only in the onboarding answers still counts as completed", async () => {
    sb.session = userSession;
    sb.profile = { data: profileRow(false), error: null };
    sb.onboarding = { data: { answers: { status: "completed", languages: ["Inglês"] } }, error: null };
    await mount();
    expect(gateNow()).toBe("completed");
  });

  it("incomplete teacher keeps going to the pending setup, with saved answers untouched", async () => {
    sb.session = userSession;
    sb.profile = { data: profileRow(false), error: null };
    sb.onboarding = { data: { answers: { status: "in_progress", current_step: 3, languages: ["Inglês"] } }, error: null };
    await mount();
    expect(gateNow()).toBe("pending");
    expect(postLoginDestination(gateNow())).toBe("/onboarding");
    expect(sb.onboarding.data.answers).toEqual({ status: "in_progress", current_step: 3, languages: ["Inglês"] });
  });

  it("a failed read of the onboarding answers is an error (retry), not 'not started'", async () => {
    sb.session = userSession;
    sb.profile = { data: profileRow(false), error: null };
    sb.onboarding = { data: null, error: { message: "network down" } };
    await mount();
    expect(gateNow()).toBe("error");
    expect(postLoginDestination(gateNow())).toBe("/");
  });

  it("if the profile already says completed, an onboarding read failure does not block access", async () => {
    sb.session = userSession;
    sb.profile = { data: profileRow(true), error: null };
    sb.onboarding = { data: null, error: { message: "network down" } };
    await mount();
    expect(gateNow()).toBe("completed");
  });

  it("a failed profile read is an error, never pending or completed", async () => {
    sb.session = userSession;
    sb.profile = { data: null, error: { message: "timeout" } };
    await mount();
    expect(gateNow()).toBe("error");
  });
});
