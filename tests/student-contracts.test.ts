import { beforeEach, describe, expect, mock, test } from "bun:test";

let insertResult: { data: unknown; error: unknown };
let contractRow: any;
let insertPayload: any;
const upload = mock(async (_p: string, _f: unknown, _o: unknown) => ({ data: {}, error: null as unknown }));
const rpc = mock(async (_name: string, _args: unknown) => ({ data: { ...contractRow, status: "active" }, error: null as unknown }));
const remove = mock(async (_p: string[]) => ({ data: [], error: null as unknown }));
const createSignedUrl = mock(async (_p: string, _s: number) => ({ data: { signedUrl: "https://signed" }, error: null }));

function chain(final: () => unknown) {
  const c: any = {
    select: () => c, eq: () => c, order: async () => ({ data: [], error: null }),
    maybeSingle: async () => final(), single: async () => final(),
    insert: (payload: unknown) => { insertPayload = payload; return c; }, update: () => c, delete: () => c,
  };
  return c;
}
const from = mock((table: string) =>
  table === "student_contracts" ? chain(() => ({ data: contractRow, error: null })) : chain(() => insertResult),
);
mock.module("@/lib/supabase", () => ({
  supabase: {
    from,
    auth: { getUser: async () => ({ data: { user: { id: "t1" } }, error: null }) },
    storage: { from: () => ({ upload, remove, createSignedUrl }) },
    rpc,
  },
}));

const lib = await import("../src/lib/student-contracts");
const file = new Blob(["x"], { type: "application/pdf" });

describe("contract documents", () => {
  beforeEach(() => {
    upload.mockClear(); remove.mockClear(); rpc.mockClear(); insertPayload = null;
    contractRow = { id: "c1", teacher_id: "t1" };
    insertResult = { data: { id: "d1" }, error: null };
  });

  test("path is teacher_id/contract_id/filename", () => {
    expect(lib.buildContractFilePath("t1", "c1", "../Contrato Álvaro.pdf", 5)).toBe("t1/c1/5_Contrato_Alvaro.pdf");
  });

  test("uploads then records", async () => {
    const doc = await lib.uploadContractDocument({ contractId: "c1", file, fileName: "a.pdf" });
    expect(doc.id).toBe("d1");
    expect(upload.mock.calls[0][0]).toStartWith("t1/c1/");
    expect(remove).not.toHaveBeenCalled();
  });

  test("record failure removes uploaded file and errors", async () => {
    insertResult = { data: null, error: { message: "rls" } };
    await expect(lib.uploadContractDocument({ contractId: "c1", file, fileName: "a.pdf" })).rejects.toMatchObject({ code: "record_failed" });
    expect(remove.mock.calls[0][0][0]).toStartWith("t1/c1/");
  });

  test("failed rollback is reported as orphan", async () => {
    insertResult = { data: null, error: { message: "rls" } };
    remove.mockImplementationOnce(async () => ({ data: [], error: { message: "denied" } }));
    await expect(lib.uploadContractDocument({ contractId: "c1", file, fileName: "a.pdf" })).rejects.toMatchObject({ code: "record_failed_orphan" });
  });

  test("no upload without an existing contract", async () => {
    contractRow = null;
    await expect(lib.uploadContractDocument({ contractId: "c1", file, fileName: "a.pdf" })).rejects.toMatchObject({ code: "not_found" });
    expect(upload).not.toHaveBeenCalled();
  });

  test("creates a draft and activates it through the atomic renewal RPC", async () => {
    const result = await lib.createCurrentStudentContract({ student_id: "s1", start_date: "2026-02-01", end_date: "2027-02-01" });
    expect(insertPayload).toMatchObject({ student_id: "s1", teacher_id: "t1", status: "draft" });
    expect(rpc.mock.calls[0]).toEqual(["activate_student_contract", { p_contract_id: "c1" }]);
    expect(result.status).toBe("active");
  });

  test("rejects invalid status, missing end and end on/before start", async () => {
    await expect(lib.setStudentContractStatus("c1", "expired" as any)).rejects.toMatchObject({ code: "invalid_input" });
    await expect(lib.createStudentContract({ student_id: "s", start_date: "2026-02-01" })).rejects.toMatchObject({ code: "invalid_input" });
    await expect(lib.createStudentContract({ student_id: "s", start_date: "2026-02-01", end_date: "2026-02-01" })).rejects.toMatchObject({ code: "invalid_input" });
    await expect(lib.createStudentContract({ student_id: "s", start_date: "2026-02-01", end_date: "2026-01-01" })).rejects.toMatchObject({ code: "invalid_input" });
  });

  test("records signed PDF metadata and blocks disallowed files before upload", async () => {
    await lib.uploadContractDocument({ contractId: "c1", file, fileName: "a.pdf" });
    expect(insertPayload).toMatchObject({ document_type: "signed", mime_type: "application/pdf", file_size_bytes: 1 });
    upload.mockClear();
    await expect(lib.uploadContractDocument({ contractId: "c1", file: new Blob(["doc"], { type: "application/msword" }), fileName: "a.doc" })).rejects.toMatchObject({ code: "invalid_input" });
    expect(upload).not.toHaveBeenCalled();
  });

  test("signed url defaults to 300s", async () => {
    expect(await lib.getContractDocumentSignedUrl("t1/c1/f.pdf")).toBe("https://signed");
    expect(createSignedUrl.mock.calls[0][1]).toBe(300);
  });
});
