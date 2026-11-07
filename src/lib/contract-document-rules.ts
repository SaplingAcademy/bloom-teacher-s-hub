export const MAX_CONTRACT_FILE_SIZE_BYTES = 10 * 1024 * 1024;
export const CONTRACT_FILE_ACCEPT = ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png";

export const CONTRACT_FILE_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;
export type ContractFileMimeType = (typeof CONTRACT_FILE_MIME_TYPES)[number];
export type ContractFileIssue = "empty" | "invalidType" | "tooLarge";

const EXTENSION_MIME_TYPES: Record<string, ContractFileMimeType> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
};

export function contractFileMimeType(file: Blob, fileName: string): ContractFileMimeType | null {
  if ((CONTRACT_FILE_MIME_TYPES as readonly string[]).includes(file.type)) {
    return file.type as ContractFileMimeType;
  }
  // Some browsers provide no MIME for a local file; the extension is the fallback.
  if (file.type) return null;
  const extension = fileName.split(/[\\/]/).pop()?.split(".").pop()?.toLowerCase() ?? "";
  return EXTENSION_MIME_TYPES[extension] ?? null;
}

export function validateContractFile(file: Blob, fileName: string): ContractFileIssue | null {
  if (file.size <= 0) return "empty";
  if (file.size > MAX_CONTRACT_FILE_SIZE_BYTES) return "tooLarge";
  if (!contractFileMimeType(file, fileName)) return "invalidType";
  return null;
}
