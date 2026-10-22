import { supabase } from "@/lib/supabase";
import {
  CONTRACT_DOCUMENT_TYPES,
  CONTRACT_STATUSES,
  type ContractDocumentType,
  type ContractStatus,
  type CreateStudentContractInput,
  type StudentContractDocumentRow,
  type StudentContractEditable,
  type StudentContractRow,
} from "@/types/contracts";

export const CONTRACTS_BUCKET = "contracts";
export const DEFAULT_SIGNED_URL_SECONDS = 300;

/** Error with a stable code so the UI can map it to a translated message. */
export class ContractError extends Error {
  constructor(
    public code:
      | "not_authenticated"
      | "invalid_input"
      | "not_found"
      | "db_error"
      | "upload_failed"
      | "record_failed"
      | "record_failed_orphan"
      | "storage_error",
    message: string,
    public cause?: unknown,
  ) {
    super(message);
    this.name = "ContractError";
  }
}

async function requireTeacherId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  const id = data?.user?.id;
  if (error || !id) throw new ContractError("not_authenticated", "No authenticated session", error);
  return id;
}

function dbFail(op: string, error: unknown): never {
  const msg = (error as { message?: string })?.message ?? "unknown error";
  throw new ContractError("db_error", `${op}: ${msg}`, error);
}

function assertStatus(status: string): asserts status is ContractStatus {
  if (!(CONTRACT_STATUSES as readonly string[]).includes(status))
    throw new ContractError("invalid_input", `Invalid contract status: ${status}`);
}

function assertDates(start?: string | null, end?: string | null) {
  if (start && end && end < start)
    throw new ContractError("invalid_input", "end_date must be on or after start_date");
}

/** Keeps filenames safe as a single storage path segment. */
export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^\.+/, "");
  return cleaned.slice(-150) || "file";
}

/** Required path: teacher_id/contract_id/filename */
export function buildContractFilePath(teacherId: string, contractId: string, fileName: string, now = Date.now()): string {
  return `${teacherId}/${contractId}/${now}_${sanitizeFileName(fileName)}`;
}

// ---------- Contracts ----------

export async function listStudentContracts(studentId: string): Promise<StudentContractRow[]> {
  const teacherId = await requireTeacherId();
  const { data, error } = await supabase
    .from("student_contracts")
    .select("*")
    .eq("teacher_id", teacherId)
    .eq("student_id", studentId)
    .order("start_date", { ascending: false });
  if (error) dbFail("listStudentContracts", error);
  return (data ?? []) as StudentContractRow[];
}

export async function getStudentContract(contractId: string): Promise<StudentContractRow | null> {
  const teacherId = await requireTeacherId();
  const { data, error } = await supabase
    .from("student_contracts")
    .select("*")
    .eq("teacher_id", teacherId)
    .eq("id", contractId)
    .maybeSingle();
  if (error) dbFail("getStudentContract", error);
  return (data as StudentContractRow | null) ?? null;
}

export async function createStudentContract(input: CreateStudentContractInput): Promise<StudentContractRow> {
  if (!input.student_id || !input.start_date)
    throw new ContractError("invalid_input", "student_id and start_date are required");
  assertDates(input.start_date, input.end_date);
  if (input.status) assertStatus(input.status);
  const teacherId = await requireTeacherId();
  const { data, error } = await supabase
    .from("student_contracts")
    .insert({ ...input, teacher_id: teacherId })
    .select("*")
    .single();
  if (error || !data) dbFail("createStudentContract", error);
  return data as StudentContractRow;
}

export async function updateStudentContract(
  contractId: string,
  patch: StudentContractEditable,
): Promise<StudentContractRow> {
  assertDates(patch.start_date, patch.end_date);
  const teacherId = await requireTeacherId();
  const { data, error } = await supabase
    .from("student_contracts")
    .update(patch)
    .eq("teacher_id", teacherId)
    .eq("id", contractId)
    .select("*")
    .maybeSingle();
  if (error) dbFail("updateStudentContract", error);
  if (!data) throw new ContractError("not_found", "Contract not found");
  return data as StudentContractRow;
}

export async function setStudentContractStatus(contractId: string, status: ContractStatus): Promise<StudentContractRow> {
  assertStatus(status);
  const teacherId = await requireTeacherId();
  const { data, error } = await supabase
    .from("student_contracts")
    .update({ status })
    .eq("teacher_id", teacherId)
    .eq("id", contractId)
    .select("*")
    .maybeSingle();
  if (error) dbFail("setStudentContractStatus", error);
  if (!data) throw new ContractError("not_found", "Contract not found");
  return data as StudentContractRow;
}

// ---------- Documents ----------

export async function listContractDocuments(contractId: string): Promise<StudentContractDocumentRow[]> {
  const teacherId = await requireTeacherId();
  const { data, error } = await supabase
    .from("student_contract_documents")
    .select("*")
    .eq("teacher_id", teacherId)
    .eq("contract_id", contractId)
    .order("created_at", { ascending: false });
  if (error) dbFail("listContractDocuments", error);
  return (data ?? []) as StudentContractDocumentRow[];
}

export interface UploadContractDocumentInput {
  contractId: string;
  file: File | Blob;
  fileName: string;
  documentType?: ContractDocumentType;
}

/**
 * Uploads to the private bucket only for an existing contract, then records it.
 * If recording fails, the uploaded file is removed; any rollback failure is reported.
 */
export async function uploadContractDocument(input: UploadContractDocumentInput): Promise<StudentContractDocumentRow> {
  const documentType = input.documentType ?? "original";
  if (!(CONTRACT_DOCUMENT_TYPES as readonly string[]).includes(documentType))
    throw new ContractError("invalid_input", `Invalid document type: ${documentType}`);
  if (!input.contractId) throw new ContractError("invalid_input", "contractId is required");

  const teacherId = await requireTeacherId();
  const contract = await getStudentContract(input.contractId);
  if (!contract) throw new ContractError("not_found", "Contract not found");

  const path = buildContractFilePath(teacherId, contract.id, input.fileName);
  const mime = (input.file as Blob).type || null;
  const { error: upErr } = await supabase.storage
    .from(CONTRACTS_BUCKET)
    .upload(path, input.file, { upsert: false, contentType: mime ?? undefined });
  if (upErr) throw new ContractError("upload_failed", `Upload failed: ${upErr.message}`, upErr);

  const { data, error } = await supabase
    .from("student_contract_documents")
    .insert({
      contract_id: contract.id,
      teacher_id: teacherId,
      document_type: documentType,
      file_path: path,
      file_name: input.fileName,
      file_size_bytes: (input.file as Blob).size ?? null,
      mime_type: mime,
    })
    .select("*")
    .single();

  if (error || !data) {
    const { error: rmErr } = await supabase.storage.from(CONTRACTS_BUCKET).remove([path]);
    if (rmErr)
      throw new ContractError(
        "record_failed_orphan",
        `Document record failed and uploaded file could not be removed (${path})`,
        { recordError: error, removeError: rmErr },
      );
    throw new ContractError("record_failed", `Document record failed: ${error?.message ?? "no row"}`, error);
  }
  return data as StudentContractDocumentRow;
}

/** Deletes the DB record first (RLS-checked), then the stored file. */
export async function deleteContractDocument(documentId: string): Promise<void> {
  const teacherId = await requireTeacherId();
  const { data, error } = await supabase
    .from("student_contract_documents")
    .delete()
    .eq("teacher_id", teacherId)
    .eq("id", documentId)
    .select("file_path")
    .maybeSingle();
  if (error) dbFail("deleteContractDocument", error);
  if (!data) throw new ContractError("not_found", "Document not found");
  const { error: rmErr } = await supabase.storage.from(CONTRACTS_BUCKET).remove([(data as { file_path: string }).file_path]);
  if (rmErr) throw new ContractError("storage_error", `Record removed but file deletion failed: ${rmErr.message}`, rmErr);
}

/** Temporary signed URL for viewing/downloading; the bucket stays private. */
export async function getContractDocumentSignedUrl(
  filePath: string,
  options: { expiresIn?: number; download?: string | boolean } = {},
): Promise<string> {
  await requireTeacherId();
  const { data, error } = await supabase.storage
    .from(CONTRACTS_BUCKET)
    .createSignedUrl(filePath, options.expiresIn ?? DEFAULT_SIGNED_URL_SECONDS, options.download ? { download: options.download } : undefined);
  if (error || !data?.signedUrl)
    throw new ContractError("storage_error", `Could not create signed URL: ${error?.message ?? "no url"}`, error);
  return data.signedUrl;
}
