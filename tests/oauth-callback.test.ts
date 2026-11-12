import { describe, expect, it } from "vitest";
import {
  OAUTH_PENDING_KEY,
  clearOAuthPending,
  consumeOAuthPending,
  markOAuthPending,
  oauthErrorKey,
  oauthRedirectUrl,
} from "../src/lib/oauth-callback";

const memoryStore = () => {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
};

describe("Google OAuth return handling", () => {
  it("redirects back to /auth on the current origin (production and dev)", () => {
    expect(oauthRedirectUrl("https://bloomtool.com.br")).toBe("https://bloomtool.com.br/auth");
    expect(oauthRedirectUrl("http://localhost:8080/")).toBe("http://localhost:8080/auth");
  });

  it("the marker identifies exactly one OAuth return and is removed when read", () => {
    const store = memoryStore();
    expect(consumeOAuthPending(store)).toBe(false);
    markOAuthPending(store);
    expect(store.map.get(OAUTH_PENDING_KEY)).toBe("google");
    expect(consumeOAuthPending(store)).toBe(true);
    expect(consumeOAuthPending(store)).toBe(false); // a later confirmation link is not an OAuth return
  });

  it("clearing (failed start or abandoned redirect) drops the marker", () => {
    const store = memoryStore();
    markOAuthPending(store);
    clearOAuthPending(store);
    expect(consumeOAuthPending(store)).toBe(false);
  });

  it("unavailable storage never throws and falls back to the generic callback", () => {
    const broken = {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
      removeItem: () => { throw new Error("blocked"); },
    };
    expect(() => markOAuthPending(broken)).not.toThrow();
    expect(consumeOAuthPending(broken)).toBe(false);
  });

  it("maps a cancelled consent and other provider errors to distinct messages", () => {
    expect(oauthErrorKey("access_denied", "The user denied the request")).toBe("auth.googleCancelled");
    expect(oauthErrorKey("server_error", "Error getting user email from external provider")).toBe("auth.googleFailed");
    expect(oauthErrorKey(null, null)).toBe("auth.googleFailed");
  });
});
