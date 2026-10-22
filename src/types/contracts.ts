// Row/insert/update shapes mirroring the manually applied Phase 1A schema.
// The Supabase client in this project is untyped, so these are the canonical types.

export const CONTRACT_STATUSES = ["draft", "active", "renewed", "completed", "cancelled"] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

export const CONTRACT_SIGNER_TYPES = ["student", "guardian", "company", "other"] as const;
export type ContractSignerType = (typeof CONTRACT_SIGNER_TYPES)[number];

export const CONTRACT_DOCUMENT_TYPES = ["original", "signed", "amendment", "cancellation", "other"] as const;
export type ContractDocumentType = (typeof CONTRACT_DOCUMENT_TYPES)[number];

export interface StudentContractRow {
  id: string;
  teacher_id: string;
  student_id: string;
  student_package_id: string | null;
  previous_contract_id: string | null;
  title: string | null;
  contract_number: string | null;
  start_date: string;
  end_date: string | null;
  status: ContractStatus;
  reminders_enabled: boolean;
  signer_type: ContractSignerType;
  signer_name: string | null;
  signer_email: string | null;
  signer_phone: string | null;
  signer_document: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface StudentContractDocumentRow {
  id: string;
  contract_id: string;
  teacher_id: string;
  document_type: ContractDocumentType;
  file_path: string;
  file_name: string;
  file_size_bytes: number | null;
  mime_type: string | null;
  is_current: boolean;
  created_at: string;
}

/** Fields a teacher may set; teacher_id/student_id are supplied separately on create. */
export type StudentContractEditable = Partial<
  Pick<
    StudentContractRow,
    | "student_package_id"
    | "title"
    | "contract_number"
    | "start_date"
    | "end_date"
    | "reminders_enabled"
    | "signer_type"
    | "signer_name"
    | "signer_email"
    | "signer_phone"
    | "signer_document"
    | "notes"
  >
>;

export interface CreateStudentContractInput extends StudentContractEditable {
  student_id: string;
  start_date: string;
  status?: ContractStatus;
}
