// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  list: vi.fn(), search: vi.fn(), send: vi.fn(), respond: vi.fn(), cancel: vi.fn(), remove: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "me" }, session: { user: { id: "me" } }, loading: false }) }));
vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ t: (key: string) => key, lang: "pt" }) }));
vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("@/lib/teacher-contacts", async (original) => ({
  ...(await original<object>()),
  listMyContacts: mocks.list, searchTeachers: mocks.search, sendContactRequest: mocks.send,
  respondContactRequest: mocks.respond, cancelContactRequest: mocks.cancel, removeContact: mocks.remove,
}));
import { MyContactsPage } from "../src/components/bloom/contacts/MyContactsPage";

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as any;
let root: Root;
const entry = (request_id: string, relation: string, name: string | null) => ({ request_id, other_id: `o-${request_id}`, full_name: name, avatar_url: null, relation, created_at: "2026-11-10T10:00:00Z", responded_at: relation === "contact" ? "2026-11-11T10:00:00Z" : null });
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const text = () => document.body.textContent ?? "";
const button = (label: string, within: ParentNode = document) => Array.from(within.querySelectorAll("button")).find((b) => b.textContent?.includes(label))!;
async function type(value: string) {
  const input = document.querySelector<HTMLInputElement>('input[type="search"]')!;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 350));
  });
  await settle();
}
const openTab = async (label: string) => { await act(async () => { const tab = button(label); tab.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })); tab.focus(); tab.click(); }); await settle(); };

beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.values(mocks).forEach((m) => typeof m === "function" && m.mockReset());
  Object.values(mocks.toast).forEach((m) => m.mockReset());
  mocks.list.mockResolvedValue([entry("c1", "contact", "Carla Dias"), entry("i1", "incoming", "Igor Reis"), entry("s1", "outgoing", null)]);
  mocks.search.mockResolvedValue([]);
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(createElement(QueryClientProvider, { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }, createElement(MyContactsPage))));
  await settle();
});
afterEach(async () => { await act(async () => root.unmount()); document.body.innerHTML = ""; });

describe("My Contacts page", () => {
  it("organizes contacts, received and sent requests with counts", async () => {
    expect(document.querySelectorAll('[data-testid="contact-row"]')).toHaveLength(1);
    expect(text()).toContain("Carla Dias");
    await openTab("contacts.tabIncoming");
    expect(document.querySelectorAll('[data-testid="incoming-row"]')).toHaveLength(1);
    await openTab("contacts.tabOutgoing");
    expect(document.querySelector('[data-testid="outgoing-row"]')!.textContent).toContain("contacts.unnamed");
  });
  it("searches only valid queries and never shows e-mails", async () => {
    await type("An");
    expect(mocks.search).not.toHaveBeenCalled();
    expect(text()).toContain("contacts.searchHint");
    mocks.search.mockResolvedValue([{ teacher_id: "t9", full_name: "Ana Lima", avatar_url: null, relation: "none", request_id: null, cooldown_until: null }]);
    await type("Ana@Escola.com");
    expect(mocks.search).toHaveBeenCalledWith("ana@escola.com");
    const row = document.querySelector('[data-testid="contact-search-result"]')!;
    expect(row.textContent).toContain("Ana Lima");
    expect(row.textContent).not.toContain("@");
  });
  it("sends a request through the RPC and confirms it", async () => {
    mocks.search.mockResolvedValue([{ teacher_id: "t9", full_name: "Ana Lima", avatar_url: null, relation: "none", request_id: null, cooldown_until: null }]);
    mocks.send.mockResolvedValue({ request_id: "r9", relation: "outgoing", cooldown_until: null });
    await type("Ana");
    await act(async () => button("contacts.add").click());
    await settle();
    expect(mocks.send).toHaveBeenCalledWith("t9");
    expect(mocks.toast.success).toHaveBeenCalledWith("contacts.sent", expect.anything());
  });
  it("shows the cooldown time left without mentioning a refusal", async () => {
    const until = new Date(Date.now() + 2.5 * 86_400_000).toISOString();
    mocks.search.mockResolvedValue([{ teacher_id: "t9", full_name: "Ana Lima", avatar_url: null, relation: "cooldown", request_id: null, cooldown_until: until }]);
    await type("Ana");
    const cooldown = document.querySelector('[data-testid="contact-cooldown"]')!;
    expect(cooldown.textContent).toBe("contacts.cooldownMany");
    expect(button("contacts.add")).toBeUndefined();
  });
  it("accepts, declines and cancels with the request id", async () => {
    await openTab("contacts.tabIncoming");
    await act(async () => button("contacts.accept").click());
    await settle();
    expect(mocks.respond).toHaveBeenCalledWith("i1", true);
    await act(async () => button("contacts.decline").click());
    await settle();
    expect(mocks.respond).toHaveBeenLastCalledWith("i1", false);
    await openTab("contacts.tabOutgoing");
    await act(async () => button("contacts.cancel").click());
    await settle();
    expect(mocks.cancel).toHaveBeenCalledWith("s1");
    expect(mocks.list.mock.calls.length).toBeGreaterThan(1); // lists are re-read after each action
  });
  it("removes a contact only after confirmation and reports errors clearly", async () => {
    await act(async () => button("contacts.remove").click());
    expect(mocks.remove).not.toHaveBeenCalled();
    mocks.remove.mockRejectedValueOnce({ message: "contact_not_found" });
    const dialog = document.querySelector('[role="alertdialog"]')!;
    await act(async () => button("contacts.remove", dialog).click());
    await settle();
    expect(mocks.remove).toHaveBeenCalledWith("o-c1");
    expect(mocks.toast.error).toHaveBeenCalledWith("contacts.errors.contact_not_found", expect.anything());
    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull(); // stays open on failure
  });
});

describe("My Contacts page states", () => {
  it("shows a retryable error when the lists cannot be loaded", async () => {
    await act(async () => root.unmount());
    mocks.list.mockRejectedValue(new Error("network"));
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root.render(createElement(QueryClientProvider, { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }, createElement(MyContactsPage))));
    await settle();
    expect(document.querySelector('[role="alert"]')!.textContent).toContain("contacts.loadError");
    mocks.list.mockResolvedValue([]);
    await act(async () => button("contacts.retry").click());
    await settle();
    expect(text()).toContain("contacts.emptyContacts");
  });
});

describe("My Contacts tab from the URL", () => {
  it("opens the tab given by the route and reports tab changes", async () => {
    await act(async () => root.unmount());
    const onTabChange = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root.render(createElement(QueryClientProvider, { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
      createElement(MyContactsPage, { tab: "received", onTabChange }))));
    await settle();
    expect(document.querySelectorAll('[data-testid="incoming-row"]')).toHaveLength(1);
    expect(document.querySelector('[data-testid="contact-row"]')).toBeNull();
    await openTab("contacts.tabOutgoing");
    expect(onTabChange).toHaveBeenCalledWith("sent");
  });
});

