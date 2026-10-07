import { describe, expect, test, beforeEach } from "bun:test";

class MemStore {
  m = new Map<string, string>();
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}
const g = globalThis as any;
g.window = g;
g.localStorage = new MemStore();
g.sessionStorage = new MemStore();

const us = await import("../src/lib/user-storage");
const n = await import("../src/lib/onboarding-name");

const DRAFT = "bloom.onboarding.draft";

describe("onboarding preferred name", () => {
  beforeEach(() => { g.localStorage.clear(); g.sessionStorage.clear(); });

  test("profiles.full_name NULL → empty field", () => {
    expect(n.resolveInitialPreferredName(undefined, null, "a@x.com")).toBe("");
    expect(n.resolveInitialPreferredName("", "", "a@x.com")).toBe("");
  });

  test("real profiles.full_name → prefilled", () => {
    expect(n.resolveInitialPreferredName(undefined, "Débora", "deb@x.com")).toBe("Débora");
  });

  test("name is never derived from e-mail", () => {
    expect(n.resolveInitialPreferredName(undefined, "joao130500", "joao130500@gmail.com")).toBe("");
    expect(n.resolveInitialPreferredName(undefined, "a@b.com", "a@b.com")).toBe("");
    expect(n.resolveInitialPreferredName(undefined, "Educator", "z@x.com")).toBe("");
  });

  test("typed name survives tab switch / state reload and wins over profile", () => {
    us.ensureStorageOwner("A");
    us.setUserItem(DRAFT, JSON.stringify({ preferredName: "Deb" }), "A");
    const restored = JSON.parse(us.getUserItem(DRAFT, "A")!);
    expect(restored.preferredName).toBe("Deb");
    expect(n.resolveInitialPreferredName(restored.preferredName, "Débora Silva", "d@x.com")).toBe("Deb");
  });

  test("draft name of account A never reaches account B", () => {
    us.ensureStorageOwner("A");
    us.setUserItem(DRAFT, JSON.stringify({ preferredName: "Ana" }), "A");
    us.purgeBloomLocalData();
    us.ensureStorageOwner("B");
    expect(us.getUserItem(DRAFT, "B")).toBeNull();
    expect(n.resolveInitialPreferredName(undefined, null, "b@x.com")).toBe("");
  });

  test("completion writes the trimmed name to profiles.full_name", () => {
    expect(n.toProfileFullName("  Débora  ")).toBe("Débora");
  });

  test("empty field saves NULL, not empty string", () => {
    expect(n.toProfileFullName("")).toBeNull();
    expect(n.toProfileFullName("   ")).toBeNull();
    expect(n.toProfileFullName(undefined)).toBeNull();
  });

  test("old name inside questionnaire answers is ignored and never saved there", () => {
    const loaded = n.stripNameFromAnswers({ preferredName: "Velho", languages: ["English"] });
    expect("preferredName" in loaded).toBe(false);
    expect(n.resolveInitialPreferredName((loaded as any).preferredName, "Débora", "d@x.com")).toBe("Débora");
    const saved = n.stripNameFromAnswers({ preferredName: "Novo", languages: [] });
    expect("preferredName" in saved).toBe(false);
  });

  test("saved name is reflected in UI profile state", () => {
    expect(n.profileNameState("Débora")).toEqual({ full_name: "Débora", name: "Débora" });
    expect(n.profileNameState(null)).toEqual({ full_name: null, name: "" });
  });
});
