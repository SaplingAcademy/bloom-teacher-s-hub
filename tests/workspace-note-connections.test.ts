import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ calls: [] as unknown[][], result: { data: [] as unknown, error: null as unknown } }));
vi.mock("@/lib/supabase", () => ({ supabase: {
  auth: { getUser: async () => ({ data: { user: { id: "teacher" } }, error: null }) },
  from: (table: string) => {
    const chain: Record<string, unknown> = {};
    for (const op of ["select", "eq", "order", "insert", "delete", "abortSignal"]) chain[op] = (...args: unknown[]) => { m.calls.push([table, op, ...args]); return chain; };
    chain.single = async () => m.result;
    chain.then = (resolve: (v: unknown) => void) => resolve(m.result);
    return chain;
  },
} }));
import {
  CONNECTIONS_UNAVAILABLE, CONNECTOR_GAP, connectRefusal, connectionsOf, connectorLine, createNoteConnection, deleteNoteConnection,
  fetchNoteConnections, visibleConnections, type NoteConnection,
} from "../src/lib/workspace-note-connections";

const c = (id: string, from: string, to: string): NoteConnection => ({ id, from_note_id: from, to_note_id: to });
beforeEach(() => { m.calls.length = 0; m.result = { data: [], error: null }; });

describe("connection rules (pure)", () => {
  const ids = new Set(["a", "b", "c"]);
  it("allows multiple connections, refuses self, missing notes and an existing pair in either direction", () => {
    const existing = [c("1", "a", "b")];
    expect(connectRefusal(existing, ids, "a", "c")).toBeNull();
    expect(connectRefusal(existing, ids, "c", "b")).toBeNull();
    expect(connectRefusal(existing, ids, "a", "a")).toBe("self");
    expect(connectRefusal(existing, ids, "a", "zzz")).toBe("missing");
    expect(connectRefusal(existing, ids, "a", "b")).toBe("exists");
    expect(connectRefusal(existing, ids, "b", "a")).toBe("exists");
  });
  it("hides connections of a deleted note at once and lists a note's connections with the other note", () => {
    const all = [c("1", "a", "b"), c("2", "b", "c"), c("3", "a", "gone")];
    expect(visibleConnections(all, ids).map((x) => x.id)).toEqual(["1", "2"]);
    expect(connectionsOf(all, "b").map((x) => x.otherId)).toEqual(["a", "c"]);
  });
  it("draws edge to edge along the line between centres, pointing to the target; none when notes overlap", () => {
    const left = { x: 0, y: 0, width: 100, height: 50 };
    const right = { x: 300, y: 0, width: 100, height: 50 };
    expect(connectorLine(left, right)).toEqual({ x1: 100 + CONNECTOR_GAP, y1: 25, x2: 300 - CONNECTOR_GAP, y2: 25 });
    expect(connectorLine(right, left)).toEqual({ x1: 300 - CONNECTOR_GAP, y1: 25, x2: 100 + CONNECTOR_GAP, y2: 25 });
    const below = { x: 0, y: 200, width: 100, height: 50 };
    expect(connectorLine(left, below)).toEqual({ x1: 50, y1: 50 + CONNECTOR_GAP, x2: 50, y2: 200 - CONNECTOR_GAP });
    expect(connectorLine(left, { x: 50, y: 10, width: 100, height: 50 })).toBeNull();
  });
});

describe("persistence (Supabase, by note IDs only)", () => {
  it("reads only the teacher's connections", async () => {
    m.result = { data: [c("1", "a", "b")], error: null };
    expect(await fetchNoteConnections("teacher")).toEqual([c("1", "a", "b")]);
    expect(m.calls).toContainEqual(["workspace_note_connections", "select", "id,from_note_id,to_note_id"]);
    expect(m.calls).toContainEqual(["workspace_note_connections", "eq", "user_id", "teacher"]);
  });
  it("creates with the client UUID and the authenticated owner — no coordinates", async () => {
    m.result = { data: c("u1", "a", "b"), error: null };
    await createNoteConnection("teacher", c("u1", "a", "b"));
    const insert = m.calls.find(([, op]) => op === "insert")!;
    expect(insert[2]).toEqual({ id: "u1", user_id: "teacher", from_note_id: "a", to_note_id: "b" });
    expect(Object.keys(insert[2] as object).some((k) => /pos|x|y/.test(k) && k !== "id")).toBe(false);
  });
  it("removes one connection by id, filtered by owner (notes untouched)", async () => {
    await deleteNoteConnection("teacher", "u1");
    expect(m.calls.filter(([table]) => table !== "workspace_note_connections")).toEqual([]);
    expect(m.calls).toContainEqual(["workspace_note_connections", "eq", "user_id", "teacher"]);
    expect(m.calls).toContainEqual(["workspace_note_connections", "eq", "id", "u1"]);
  });
  it("reports 'unavailable' while the manual migration is not applied", async () => {
    m.result = { data: null, error: { code: "PGRST205", message: "Could not find the table 'public.workspace_note_connections'" } };
    await expect(fetchNoteConnections("teacher")).rejects.toThrow(CONNECTIONS_UNAVAILABLE);
    m.result = { data: null, error: { code: "500", message: "boom" } };
    await expect(fetchNoteConnections("teacher")).rejects.toMatchObject({ message: "boom" });
  });
});
