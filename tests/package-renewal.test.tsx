// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveRenewalEndDate, isRenewalEndDateValid, samePackageRenewalTerms } from "../src/lib/package-renewal";
import { buildContractItems } from "../src/lib/daily-priorities";

// Active agreement: "Plano Intensivo" contracted at R$ 350/month, while the catalog now says R$ 400.
const SUMMARY = {
  studentId: "stu-1",
  hasActiveAgreement: true,
  packageId: "pkg-intensivo",
  packageName: "Plano Intensivo",
  billingModelLabel: "Mensalidade",
  isInstallment: false,
  totalAmountCents: 35000,
  installmentAmountCents: 35000,
  installmentCount: 1,
  paidInstallmentsCount: 3,
  progressLabel: "Mensalidade",
  currentInstallmentLabel: "Mensalidade",
  nextDueDate: "2026-12-10",
  lastPaymentDate: null,
  remainingBalanceCents: 0,
  remainingBalanceFormatted: "R$ 0,00",
  invoices: [],
  billingModel: "monthly" as const,
  billingDurationType: "fixed" as const,
  contractMonths: 6,
};

const CATALOG = [
  // Alphabetically first and similar-looking: must never replace the contracted package.
  { id: "pkg-a", name: "Plano Intensivo Plus", price: 999, frequency: "Monthly", billing_model: "monthly", billing_duration_type: "fixed", contract_duration_months: 6 },
  { id: "pkg-intensivo", name: "Plano Intensivo", price: 400, frequency: "Monthly", billing_model: "monthly", billing_duration_type: "fixed", contract_duration_months: 6 },
];

const mocks = vi.hoisted(() => ({
  getSummary: vi.fn(),
  renew: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ order: async () => ({ data: CATALOG, error: null }) }) }),
    }),
  },
}));

vi.mock("@/lib/finance-engine", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/finance-engine")>()),
  getStudentFinancialSummary: mocks.getSummary,
  renewStudentPackage: mocks.renew,
}));

vi.mock("@/hooks/use-language", () => ({
  useLanguage: () => ({ lang: "pt", formatStatus: (s: string) => s, t: (key: string) => key }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { PackageRenewalModal } from "../src/components/bloom/PackageRenewalModal";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

function setInput(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function clickText(text: string) {
  const button = Array.from(document.querySelectorAll("button")).find((b) => b.textContent?.includes(text));
  if (!button) throw new Error(`button ${text} not found`);
  act(() => button.click());
}

async function runRenewal(props: { currentSummary?: typeof SUMMARY }, editEnd: boolean) {
  mocks.getSummary.mockResolvedValue(SUMMARY);
  mocks.renew.mockResolvedValue({ success: true, message: "ok" });
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const mounted = root;
  act(() => mounted.render(createElement(PackageRenewalModal, {
    isOpen: true, onClose: () => {}, teacherId: "t-1", studentId: "stu-1", studentName: "Ana", ...props,
  })));
  await flush();
  await flush();

  expect(document.body.textContent).toContain("Plano Intensivo");
  clickText("packageRenewal.continue"); // step 1 -> 2 ("Mesmo pacote" is the default)
  clickText("packageRenewal.continue"); // step 2 -> 3

  const amount = document.querySelector<HTMLInputElement>('input[type="number"][step="0.01"]')!;
  expect(amount.value).toBe("350.00"); // contract value, not the catalog's 400
  const [start, end] = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="date"]'));
  expect(start.value).toBe("2026-12-10");
  expect(end.value).toBe("2027-05-10"); // suggested from the 6-month duration

  if (editEnd) {
    setInput(end, "2027-03-31");
    setInput(start, "2026-12-15"); // must not overwrite the manual end date
    expect(end.value).toBe("2027-03-31");
  }
  setInput(document.querySelector<HTMLInputElement>('input[max="31"]')!, "10");
  clickText("packageRenewal.continue"); // step 3 -> 4
  clickText("packageRenewal.confirm");
  await flush();
  expect(mocks.renew).toHaveBeenCalledTimes(1);
  return mocks.renew.mock.calls[0][0];
}

describe("same-package renewal terms", () => {
  it("keeps the contracted package and its own value, never guessing", () => {
    expect(samePackageRenewalTerms(SUMMARY)).toEqual({
      packageId: "pkg-intensivo", amountCents: 35000, installmentCount: 0, billingDurationType: "fixed", contractMonths: 6,
    });
    expect(samePackageRenewalTerms({ ...SUMMARY, packageId: undefined })).toBeNull();
    expect(samePackageRenewalTerms({ ...SUMMARY, hasActiveAgreement: false })).toBeNull();
  });

  it("treats the package duration only as an end-date suggestion", () => {
    expect(resolveRenewalEndDate({ value: "", customized: false }, "2027-05-10")).toBe("2027-05-10");
    expect(resolveRenewalEndDate({ value: "2027-03-31", customized: true }, "2027-06-10")).toBe("2027-03-31");
    expect(isRenewalEndDateValid("2026-12-10", "2026-12-10")).toBe(false);
    expect(isRenewalEndDateValid("2026-12-10", "2027-01-01")).toBe(true);
  });
});

describe("PackageRenewalModal", () => {
  it("Urgente/Financeiro entry (no summary passed) loads the contracted package and value", async () => {
    const args = await runRenewal({}, false);
    expect(mocks.getSummary).toHaveBeenCalledWith("t-1", "stu-1");
    expect(args).toMatchObject({ newPackageId: "pkg-intensivo", isSamePackage: true, totalAmountCents: 35000, endDate: null });
  });

  it("saves the manually edited end date exactly as confirmed", async () => {
    const args = await runRenewal({}, true);
    expect(args).toMatchObject({ startDate: "2026-12-15", endDate: "2027-03-31", totalAmountCents: 35000 });
  });

  it("renews identically whether opened from Urgente/Financeiro or the student profile", async () => {
    const fromFinance = await runRenewal({}, true);
    act(() => root?.unmount());
    document.body.innerHTML = "";
    vi.clearAllMocks();
    const fromProfile = await runRenewal({ currentSummary: SUMMARY }, true);
    expect(mocks.getSummary).not.toHaveBeenCalled();
    expect(fromProfile).toEqual(fromFinance);
  });
});

describe("renewal alerts for continuous monthly plans", () => {
  const base = { id: "sp1", student_id: "s1", billing_model: "monthly", billing_duration_type: "continuous", student: { full_name: "Ana", status: "Active" } };

  it("alerts when the teacher set an end date", () => {
    expect(buildContractItems([{ ...base, last_due_date: "2026-12-05" }], "2026-11-09")[0]).toMatchObject({ reason: "contract_ending_30d", date: "2026-12-05" });
    expect(buildContractItems([{ ...base, last_due_date: "2026-11-19" }], "2026-11-09")[0]).toMatchObject({ reason: "contract_ending_15d" });
  });

  it("keeps continuous plans without an end date (and legacy rows) silent", () => {
    expect(buildContractItems([{ ...base, last_due_date: null }], "2026-11-09")).toEqual([]);
    expect(buildContractItems([{ ...base, billing_model: null, snapshot_frequency: "Monthly", last_due_date: "2026-11-19" }], "2026-11-09")).toEqual([]);
  });
});
