// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ navigate: vi.fn(), update: vi.fn(), rows: [] as unknown[] }));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => mocks.navigate }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "me" } }) }));
vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ t: (key: string) => key, lang: "pt" }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/lib/supabase", () => {
  const chain: any = {
    select: () => chain, eq: () => chain, order: () => chain,
    limit: async () => ({ data: mocks.rows, error: null }),
    update: (patch: unknown) => { mocks.update(patch); return { eq: () => ({ eq: async () => ({ error: null }) }) }; },
  };
  return { supabase: { from: () => chain, channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel: () => {} } };
});
import { NotificationBell } from "../src/components/layout/NotificationBell";

let root: Root;
const note = (id: string, type: string, post_id: string | null = null) => ({ id, user_id: "me", title: `t-${id}`, message: null, type, read: false, created_at: new Date().toISOString(), post_id });
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
async function clickItem(title: string) {
  await act(async () => (document.querySelector('button[aria-haspopup], button') as HTMLButtonElement).click());
  await settle();
  const item = Array.from(document.querySelectorAll("li button")).find((b) => b.textContent?.includes(title)) as HTMLButtonElement;
  await act(async () => item.click());
  await settle();
}

beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  mocks.navigate.mockReset(); mocks.update.mockReset();
  mocks.rows = [note("a", "contact_request"), note("b", "contact_accepted"), note("c", "community_comment", "post-1"), note("d", "other")];
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(createElement(NotificationBell)));
  await settle();
});
afterEach(async () => { await act(async () => root.unmount()); document.body.innerHTML = ""; });

describe("NotificationBell navigation", () => {
  it("contact requests: mark as read and open the received tab", async () => {
    await clickItem("t-a");
    expect(mocks.update).toHaveBeenCalledWith({ read: true });
    expect(mocks.navigate).toHaveBeenCalledWith({ to: "/community/contacts", search: { tab: "received" } });
  });
  it("accepted requests open the contacts tab", async () => {
    await clickItem("t-b");
    expect(mocks.navigate).toHaveBeenCalledWith({ to: "/community/contacts", search: { tab: "contacts" } });
  });
  it("comment notifications keep opening their post", async () => {
    await clickItem("t-c");
    expect(mocks.navigate).toHaveBeenCalledWith({ to: "/community", search: { post: "post-1" } });
  });
  it("other notifications are only marked as read", async () => {
    await clickItem("t-d");
    expect(mocks.update).toHaveBeenCalledWith({ read: true });
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
});
