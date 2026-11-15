import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/bloom/contacts/MyContactsPage", () => ({ MyContactsPage: () => null }));
import { Route as CommunityRoute } from "../src/routes/_app.community";
import { Route as OldContactsRoute } from "../src/routes/_app.community_.contacts";

/** My Contacts moved into Community (?view=contacts); the old URL redirects keeping ?tab=. */
describe("My Contacts inside Community", () => {
  const validate = (search: Record<string, unknown>) => (CommunityRoute.options.validateSearch as (s: Record<string, unknown>) => unknown)(search);
  it("accepts the contacts view with its list tab and keeps ?post= for the feed", () => {
    expect(validate({ view: "contacts", tab: "received" })).toEqual({ view: "contacts", tab: "received" });
    expect(validate({ view: "contacts", tab: "bogus" })).toEqual({ view: "contacts" });
    expect(validate({ post: "p1" })).toEqual({ post: "p1" });
    expect(validate({ view: "other" })).toEqual({});
  });
  it("redirects /community/contacts to the Community tab, keeping the selected list", () => {
    const beforeLoad = OldContactsRoute.options.beforeLoad as (ctx: { search: { tab?: string } }) => void;
    const thrown = (search: { tab?: string }) => { try { beforeLoad({ search }); } catch (e) { return e as { options: unknown }; } throw new Error("no redirect"); };
    expect(thrown({ tab: "sent" }).options).toMatchObject({ to: "/community", search: { view: "contacts", tab: "sent" }, replace: true });
    expect(thrown({}).options).toMatchObject({ to: "/community", search: { view: "contacts" } });
  });
});
