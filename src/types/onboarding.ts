export interface OnboardingPackage {
  id: string;
  name: string;
  lessons: number;
  price: number; // stored in REAIS (e.g., 500 for R$ 500,00)
  duration?: number; // in minutes (default 60)
  frequency?: "Monthly" | "total"; // "Monthly" (Mensalidade) or "total" (Valor total do curso)
  defaultInstallmentCount?: number; // default suggested installment count for total value package
}

export interface DayAvailability {
  startTime: string; // "09:00"
  endTime: string;   // "18:00"
}

export interface OnboardingData {
  // Step 1 - About You
  languages: string[];
  otherLanguage?: string;
  managementTool: string;

  // Step 2 - Your Business
  studentRange: string;

  // Step 3 - Your Schedule
  workingDays: string[];
  sameAvailabilityAllDays: boolean;
  unifiedAvailability: DayAvailability;
  customAvailability: Record<string, DayAvailability>;

  // Step 4 - Plans & Packages
  lessonTypes: string[];
  packages: OnboardingPackage[];

  // Step 5 - Finances
  monthlyGoal: string;
  monthlyExpense: string;
  knowsHourlyRate: boolean | null;
  hourlyRate: string;

  // Step 6 - Payments
  paymentMethods: string[];

  // Step 7 - Contracts
  contractsPreference: "YES" | "NO" | "Planning to start" | "";
}

export interface OnboardingState {
  currentStep: number; // 1 to 8 (8 is summary)
  data: OnboardingData;
  isDraftSaved: boolean;
}
