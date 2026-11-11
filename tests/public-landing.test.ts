import { describe, expect, it } from "vitest";
import { LANDING_PATH, visitorRedirectTarget } from "../src/lib/public-landing";

describe("visitor redirect from the protected app", () => {
  it("sends visitors of the bare root to the public landing page", () => {
    expect(LANDING_PATH).toBe("/conheca");
    expect(visitorRedirectTarget("/")).toBe("/conheca");
    expect(visitorRedirectTarget("/", "?utm_source=instagram")).toBe("/conheca");
  });

  it("keeps every other protected path going to sign-in", () => {
    for (const path of ["/students", "/calendar", "/finance", "/settings", "/students/abc"]) {
      expect(visitorRedirectTarget(path)).toBe("/auth");
    }
  });

  it("never diverts an auth round-trip that lands on the root", () => {
    expect(visitorRedirectTarget("/", "?code=abc")).toBe("/auth");
    expect(visitorRedirectTarget("/", "?token_hash=x&type=signup")).toBe("/auth");
    expect(visitorRedirectTarget("/", "?error=access_denied&error_description=x")).toBe("/auth");
    expect(visitorRedirectTarget("/", "", "#access_token=t&refresh_token=r")).toBe("/auth");
  });
});
