import { describe, expect, test } from "bun:test";
import {
  MAX_CONTRACT_FILE_SIZE_BYTES,
  contractFileMimeType,
  validateContractFile,
} from "../src/lib/contract-document-rules";

describe("contract document rules", () => {
  test("accepts PDF, JPG and PNG up to 10 MB", () => {
    expect(validateContractFile(new Blob(["pdf"], { type: "application/pdf" }), "contract.pdf")).toBeNull();
    expect(validateContractFile(new Blob(["jpg"], { type: "image/jpeg" }), "contract.jpg")).toBeNull();
    expect(validateContractFile(new Blob(["png"], { type: "image/png" }), "contract.png")).toBeNull();
    expect(validateContractFile(new Blob([new Uint8Array(MAX_CONTRACT_FILE_SIZE_BYTES)], { type: "application/pdf" }), "contract.pdf")).toBeNull();
  });

  test("uses the extension only when the browser omits MIME", () => {
    expect(contractFileMimeType(new Blob(["jpg"]), "contrato.JPG")).toBe("image/jpeg");
    expect(contractFileMimeType(new Blob(["not-image"], { type: "text/plain" }), "contrato.jpg")).toBeNull();
  });

  test("rejects DOCX, empty and oversized files", () => {
    expect(validateContractFile(new Blob(["doc"], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }), "contract.docx")).toBe("invalidType");
    expect(validateContractFile(new Blob([], { type: "application/pdf" }), "contract.pdf")).toBe("empty");
    expect(validateContractFile(new Blob([new Uint8Array(MAX_CONTRACT_FILE_SIZE_BYTES + 1)], { type: "application/pdf" }), "contract.pdf")).toBe("tooLarge");
  });
});
