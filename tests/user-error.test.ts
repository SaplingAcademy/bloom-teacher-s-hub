import { describe, expect, test } from "bun:test";
import { toUserMessage, isTechnicalMessage, UserFacingError, installToastErrorGuard } from "../src/lib/user-error";

const FB = "Não foi possível salvar o aluno. Tente novamente.";

describe("toUserMessage", () => {
  test.each([
    'duplicate key value violates unique constraint "students_pkey"',
    "PGRST204: Could not find the 'meeting_url' column of 'student_schedules' in the schema cache",
    "23505",
    "new row violates row-level security policy for table \"invoices\"",
    "TypeError: Cannot read properties of undefined (reading 'id')",
    '{"code":"42P10","message":"x"}',
    "[object Object]",
    "permission denied for table students",
  ])("hides technical: %s", (msg) => {
    expect(toUserMessage(new Error(msg), FB, "pt")).toBe(FB);
  });
  test("network → connection message", () => {
    expect(toUserMessage(new TypeError("Failed to fetch"), FB, "pt")).toMatch(/conexão/);
  });
  test("keeps user validation messages", () => {
    for (const m of ["O link da Aula 2 é inválido.", "Este horário entra em conflito com outra aula.", "Preencha os campos obrigatórios."]) {
      expect(isTechnicalMessage(m)).toBe(false);
      expect(toUserMessage(m, FB, "pt")).toBe(m);
    }
    expect(toUserMessage(new UserFacingError("Escolha um pacote."), FB, "pt")).toBe("Escolha um pacote.");
  });
  test("generic fallback without context, i18n", () => {
    expect(toUserMessage({ message: "pgrst" }, undefined, "pt")).toBe("Não foi possível concluir esta ação. Tente novamente.");
    expect(toUserMessage(null, undefined, "en")).toBe("We couldn't complete this action. Please try again.");
  });
});

describe("toast guard", () => {
  test("sanitizes technical strings, keeps friendly ones", () => {
    const shown: any[] = [];
    const api = { error: (m: any) => shown.push(m) };
    installToastErrorGuard(api);
    api.error("duplicate key value violates unique constraint");
    api.error("Preencha os campos obrigatórios.");
    expect(shown[0]).not.toMatch(/duplicate/);
    expect(shown[1]).toBe("Preencha os campos obrigatórios.");
  });
});
