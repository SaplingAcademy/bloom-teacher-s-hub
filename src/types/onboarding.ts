export interface OnboardingPackage {
  id: string;
  name: string;
  lessons: number;
  price: number; // stored in REAIS (e.g., 500 for R$ 500,00)
  duration?: number; // in minutes (default 60)
  frequency?: "Monthly" | "total" | "One-time"; // "Monthly" (Mensalidade), "total" (Valor total), or "One-time" (Aula avulsa)
  defaultInstallmentCount?: number; // default suggested installment count for total value package
  method?: string; // payment method (Pix, Bank Transfer, Credit Card, Cash)
}

export interface DayAvailability {
  startTime: string; // "09:00"
  endTime: string;   // "18:00"
}

/** Recurring weekly rest block collected in onboarding (saved to settings.rest_blocks) */
export interface OnboardingRestBlock {
  id: string;
  day: string; // "Monday"
  startTime: string; // "12:00"
  endTime: string; // "13:30"
  label?: string;
}

/** Vacation / day-off period collected in onboarding (saved to teacher_time_off) */
export interface OnboardingTimeOff {
  id: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  title?: string;
}

export interface OnboardingData {
  // Step 1 - About You
  languages: string[];
  otherLanguage?: string;
  managementTool?: string; // Legacy string for backward compatibility
  managementTools: string[];
  otherPlatformText?: string;
  otherManagementText?: string;

  // Step 2 - Your Business
  studentRange: string;

  // Step 3 - Your Schedule
  workingDays: string[];
  sameAvailabilityAllDays: boolean;
  unifiedAvailability: DayAvailability;
  customAvailability: Record<string, DayAvailability>;
  /** Optional — recurring weekly pauses (rest_blocks) */
  restBlocks: OnboardingRestBlock[];
  /** Optional — vacations and days off (teacher_time_off) */
  timeOff: OnboardingTimeOff[];

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
