import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  calls: [] as { table: string; op: string; payload?: any; filters: string[] }[],
  response: { data: [] as any, error: null as any },
}));
vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (table: string) => {
      const call = { table, op: "select", payload: undefined as any, filters: [] as string[] };
      const chain: any = {
        select: () => chain,
        insert: (payload: any) => { call.op = "insert"; call.payload = payload; return chain; },
        delete: () => { call.op = "delete"; return chain; },
        eq: (col: string, val: string) => { call.filters.push(`${col}=${val}`); return chain; },
        then: (resolve: (v: unknown) => void) => { db.calls.push(call); resolve(db.response); },
      };
      return chain;
    },
  },
}));

import { fetchSavedPostIds, isMissingSavedPostsTable, savePost, unsavePost } from "@/lib/community-saved";

beforeEach(() => { db.calls = []; db.response = { data: [], error: null }; });

describe("isMissingSavedPostsTable", () => {
  it("matches only the missing saved-posts table", () => {
    expect(isMissingSavedPostsTable({ code: "PGRST205", message: "Could not find the table 'public.community_saved_posts' in the schema cache" })).toBe(true);
    expect(isMissingSavedPostsTable({ code: "42P01", message: 'relation "public.community_saved_posts" does not exist' })).toBe(true);
    expect(isMissingSavedPostsTable({ code: "PGRST205", message: "Could not find the table 'public.community_posts' in the schema cache" })).toBe(false);
    expect(isMissingSavedPostsTable({ code: "42P01", message: 'relation "public.comments" does not exist' })).toBe(false);
    expect(isMissingSavedPostsTable({ code: "42501", message: "permission denied for table community_saved_posts" })).toBe(false);
    expect(isMissingSavedPostsTable({ code: "PGRST301", message: "JWT expired" })).toBe(false);
    expect(isMissingSavedPostsTable({ message: "Failed to fetch" })).toBe(false);
    expect(isMissingSavedPostsTable(null)).toBe(false);
  });
});

describe("fetchSavedPostIds", () => {
  it("returns only the teacher's saved ids, filtering by their user id", async () => {
    db.response = { data: [{ post_id: "p1" }, { post_id: "p3" }], error: null };
    const result = await fetchSavedPostIds("me");
    expect([...result.ids]).toEqual(["p1", "p3"]);
    expect(result).toMatchObject({ savedEnabled: true, error: null });
    expect(db.calls).toEqual([{ table: "community_saved_posts", op: "select", payload: undefined, filters: ["user_id=me"] }]);
  });

  it("hides saving (no error) while the table does not exist", async () => {
    db.response = { data: null, error: { code: "PGRST205", message: "Could not find the table 'public.community_saved_posts' in the schema cache" } };
    expect(await fetchSavedPostIds("me")).toEqual({ ids: new Set(), error: null, savedEnabled: false });
  });

  it("surfaces permission and connection errors instead of masking them", async () => {
    for (const error of [{ code: "42501", message: "permission denied for table community_saved_posts" }, { message: "Failed to fetch" }]) {
      db.response = { data: null, error };
      const result = await fetchSavedPostIds("me");
      expect(result.error).toEqual(error);
      expect(result.savedEnabled).toBe(true);
    }
  });
});

describe("savePost / unsavePost", () => {
  it("saves as the current teacher; a duplicate counts as already saved", async () => {
    await savePost("me", "p1");
    expect(db.calls[0]).toMatchObject({ table: "community_saved_posts", op: "insert", payload: { user_id: "me", post_id: "p1" } });
    db.response = { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } };
    expect(await savePost("me", "p1")).toEqual({ error: null });
  });

  it("surfaces other write errors", async () => {
    db.response = { data: null, error: { code: "42501", message: "new row violates row-level security policy" } };
    expect((await savePost("me", "p1")).error?.code).toBe("42501");
  });

  it("removes only the teacher's own save for that post", async () => {
    await unsavePost("me", "p1");
    expect(db.calls[0]).toEqual({ table: "community_saved_posts", op: "delete", payload: undefined, filters: ["user_id=me", "post_id=p1"] });
  });

  it("never touches reactions, comments, ranking or notifications", async () => {
    await fetchSavedPostIds("me");
    await savePost("me", "p1");
    await unsavePost("me", "p1");
    expect(new Set(db.calls.map((c) => c.table))).toEqual(new Set(["community_saved_posts"]));
  });
});
