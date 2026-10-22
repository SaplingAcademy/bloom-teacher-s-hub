import { describe, expect, test } from "bun:test";
import { emptyContractForm, formToCreateInput, formToPatch, splitContracts, suggestDatesFromPackage, validateContractForm } from "../src/lib/contract-form";

const pkg = { id: "sp1", startDate: "2026-01-10", endDate: "2026-12-10" };

describe("contract form", () => {
  test("new contracts start as draft for the current student with reminders on", () => {
    const input = formToCreateInput("s1", { ...emptyContractForm(), startDate: "2026-02-01" }, null);
    expect(input.status).toBe("draft");
    expect(input.student_id).toBe("s1");
    expect(input.reminders_enabled).toBe(true);
    expect(input.signer_name).toBeNull();
  });

  test("open-ended contract saves end_date null", () => {
    const f = { ...emptyContractForm(), startDate: "2026-02-01", endDate: "2026-09-01", indefinite: true };
    expect(formToPatch(f, null).end_date).toBeNull();
  });

  test("package dates only fill empty fields; unlinked omits package", () => {
    const filled = suggestDatesFromPackage({ ...emptyContractForm(), startDate: "2026-03-01" }, pkg);
    expect(filled.startDate).toBe("2026-03-01");
    expect(filled.endDate).toBe("2026-12-10");
    expect(formToPatch({ ...filled, linkPackage: true }, pkg).student_package_id).toBe("sp1");
    expect(formToPatch(filled, pkg).student_package_id).toBeNull();
  });

  test("validation", () => {
    expect(validateContractForm(emptyContractForm())).toBe("requiredStart");
    expect(validateContractForm({ ...emptyContractForm(), startDate: "2026-05-01", endDate: "2026-04-01" })).toBe("invalidDates");
  });

  test("active is current, everything else is kept as history", () => {
    const rows = [{ id: "a", status: "draft" }, { id: "b", status: "active" }, { id: "c", status: "cancelled" }] as any;
    const { current, history } = splitContracts(rows);
    expect(current?.id).toBe("b");
    expect(history.map((c) => c.id)).toEqual(["a", "c"]);
  });
});
