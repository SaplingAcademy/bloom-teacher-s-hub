import { describe, expect, it } from "vitest";
import { notificationTarget, parseContactsTab } from "../src/lib/notification-targets";

describe("bell notification targets", () => {
  it("keeps comment notifications opening their post", () => {
    expect(notificationTarget({ type: "community_comment", post_id: "p1" })).toEqual({ to: "/community", post: "p1" });
    expect(notificationTarget({ type: "community_comment", post_id: null })).toBeNull();
  });
  it("sends contact notifications to the right My Contacts tab", () => {
    expect(notificationTarget({ type: "contact_request", post_id: null })).toEqual({ to: "/community/contacts", tab: "received" });
    expect(notificationTarget({ type: "contact_accepted", post_id: null })).toEqual({ to: "/community/contacts", tab: "contacts" });
  });
  it("leaves other types as mark-as-read only", () => {
    expect(notificationTarget({ type: "something_else", post_id: "p1" })).toBeNull();
    expect(notificationTarget({ type: null, post_id: null })).toBeNull();
  });
  it("accepts only known URL tabs", () => {
    expect(parseContactsTab("received")).toBe("received");
    expect(parseContactsTab("sent")).toBe("sent");
    expect(parseContactsTab("incoming")).toBeUndefined();
    expect(parseContactsTab(["received"])).toBeUndefined();
  });
});
