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

describe("user-storage isolation", () => {
  beforeEach(() => { g.localStorage.clear(); g.sessionStorage.clear(); us.purgeBloomLocalData(); });

  test("A -> logout -> B -> logout -> A never shares data", () => {
    g.localStorage.setItem("other.app", "keep");
    g.localStorage.setItem("bloom.profile.data", JSON.stringify({ name: "joao130500" })); // legacy global

    us.ensureStorageOwner("A");
    expect(g.localStorage.getItem("bloom.profile.data")).toBeNull(); // legacy purged
    us.setUserItem("bloom.profile.data", JSON.stringify({ name: "Ana" }));
    us.setUserItem("bloom.onboarding.draft", "{\"x\":1}");
    us.setUserItem("bloom.dashboard.tasks", "[1]");
    g.localStorage.setItem("bloom.tags", "A-tags");
    g.localStorage.setItem("bloom.dashboard.lang", "en");

    us.purgeBloomLocalData(); // logout A
    us.ensureStorageOwner("B");
    expect(us.getUserItem("bloom.profile.data")).toBeNull();
    expect(us.getUserItem("bloom.onboarding.draft")).toBeNull();
    expect(us.getUserItem("bloom.dashboard.tasks")).toBeNull();
    expect(us.getUserItem("bloom.profile.data", "A")).toBeNull();
    expect(g.localStorage.getItem("bloom.tags")).toBeNull();
    us.setUserItem("bloom.dashboard.tasks", "[2]");

    us.purgeBloomLocalData(); // logout B
    us.ensureStorageOwner("A");
    expect(us.getUserItem("bloom.dashboard.tasks")).toBeNull();
    expect(us.getUserItem("bloom.dashboard.tasks", "B")).toBeNull();

    expect(g.localStorage.getItem("other.app")).toBe("keep");
    expect(g.localStorage.getItem("bloom.dashboard.lang")).toBe("en");
  });

  test("account switch without logout purges previous owner data", () => {
    us.ensureStorageOwner("A");
    us.setUserItem("bloom.profile.data", "{}");
    g.localStorage.setItem("bloom.pricing.goal", "1");
    us.ensureStorageOwner("B");
    expect(g.localStorage.getItem("bloom.profile.data:A")).toBeNull();
    expect(g.localStorage.getItem("bloom.pricing.goal")).toBeNull();
  });

  test("no authenticated user means no read or write", () => {
    us.setUserItem("bloom.profile.data", "{}");
    expect(us.getUserItem("bloom.profile.data")).toBeNull();
    expect(g.localStorage.length).toBe(0);
  });
});
