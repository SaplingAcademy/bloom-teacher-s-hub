import type { ContractSignerType, CreateStudentContractInput, StudentContractEditable, StudentContractRow } from "@/types/contracts";

export interface ContractFormState {
  title: string;
  startDate: string;
  endDate: string;
  indefinite: boolean;
  linkPackage: boolean;
  signerType: ContractSignerType;
  signerName: string;
  signerEmail: string;
  signerPhone: string;
  signerDocument: string;
  notes: string;
  remindersEnabled: boolean;
}

export interface CurrentPackageRef { id: string; startDate: string | null; endDate: string | null }

export function emptyContractForm(): ContractFormState {
  return {
    title: "", startDate: "", endDate: "", indefinite: false, linkPackage: false,
    signerType: "student", signerName: "", signerEmail: "", signerPhone: "", signerDocument: "",
    notes: "", remindersEnabled: true,
  };
}

export function formFromContract(c: StudentContractRow): ContractFormState {
  return {
    title: c.title ?? "", startDate: c.start_date, endDate: c.end_date ?? "", indefinite: c.end_date === null,
    linkPackage: Boolean(c.student_package_id), signerType: c.signer_type, signerName: c.signer_name ?? "",
    signerEmail: c.signer_email ?? "", signerPhone: c.signer_phone ?? "", signerDocument: c.signer_document ?? "",
    notes: c.notes ?? "", remindersEnabled: c.reminders_enabled,
  };
}

/** Package dates fill only empty fields, once, as a suggestion. */
export function suggestDatesFromPackage(form: ContractFormState, pkg: CurrentPackageRef | null): ContractFormState {
  if (!pkg) return form;
  return {
    ...form,
    startDate: form.startDate || pkg.startDate || "",
    endDate: form.indefinite ? "" : form.endDate || pkg.endDate || "",
  };
}

export type ContractFormError = "requiredStart" | "invalidDates";

export function validateContractForm(f: ContractFormState): ContractFormError | null {
  if (!f.startDate) return "requiredStart";
  if (!f.indefinite && f.endDate && f.endDate < f.startDate) return "invalidDates";
  return null;
}

const opt = (v: string) => (v.trim() ? v.trim() : null);

export function formToPatch(f: ContractFormState, pkg: CurrentPackageRef | null, existingPackageId: string | null = null): StudentContractEditable {
  return {
    title: opt(f.title),
    start_date: f.startDate,
    end_date: f.indefinite ? null : opt(f.endDate),
    student_package_id: f.linkPackage ? existingPackageId ?? pkg?.id ?? null : null,
    signer_type: f.signerType,
    signer_name: opt(f.signerName),
    signer_email: opt(f.signerEmail),
    signer_phone: opt(f.signerPhone),
    signer_document: opt(f.signerDocument),
    notes: opt(f.notes),
    reminders_enabled: f.remindersEnabled,
  };
}

export function formToCreateInput(studentId: string, f: ContractFormState, pkg: CurrentPackageRef | null): CreateStudentContractInput {
  return { ...formToPatch(f, pkg), student_id: studentId, start_date: f.startDate, status: "draft" };
}

/** Current = most recent active contract; everything else is history (never deleted). */
export function splitContracts(list: StudentContractRow[]): { current: StudentContractRow | null; history: StudentContractRow[] } {
  const current = list.find((c) => c.status === "active") ?? null;
  return { current, history: list.filter((c) => c !== current) };
}
