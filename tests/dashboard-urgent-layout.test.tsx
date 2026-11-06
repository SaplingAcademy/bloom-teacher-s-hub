// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => options,
  useNavigate: () => vi.fn(),
}));
vi.mock("@tanstack/react-query", () => ({ useQuery: vi.fn(), useQueryClient: () => ({}) }));
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: { id: "teacher" },
    profile: { full_name: "Teacher", onboarding_completed: true, onboarding_status: "completed" },
  }),
}));
vi.mock("@/hooks/use-language", () => ({
  useLanguage: () => ({ lang: "en", formatStatus: (value: string) => value, t: (key: string) => key }),
}));
vi.mock("@/lib/financial-privacy", () => ({
  useFinancialPrivacy: () => ({ money: (value: string) => value }),
}));
vi.mock("@/hooks/use-dashboard-query", () => ({
  useDashboardMetricsQuery: () => ({
    metrics: {
      todayEvents: [], activeStudents: 0, activeStudentsTrend: null,
      newLeads: 0, newLeadsTrend: null, hasRevenueSource: false,
      monthRevenueCents: 0, monthRevenueTrend: null,
    },
    isLoading: false,
    error: null,
    invalidateMetrics: vi.fn(),
  }),
}));
vi.mock("@/hooks/use-tags", () => ({
  useTags: () => ({ tags: [], addTag: vi.fn(), updateTag: vi.fn(), deleteTag: vi.fn() }),
  BRAND_COLORS: {}, TAG_ICONS: {}, getTagColorStyles: () => ({ dotClass: "" }),
}));
vi.mock("@/lib/user-storage", () => ({ getUserItem: () => null, setUserItem: vi.fn() }));
vi.mock("@/lib/calendar-sync", () => ({
  getCalendarEvents: () => [],
  saveCalendarEvents: vi.fn(),
  formatDateString: (date: Date) => date.toISOString().slice(0, 10),
}));
vi.mock("@/components/bloom/PageHeader", () => ({ PageHeader: () => createElement("div", { "data-testid": "page-header" }) }));
vi.mock("@/components/bloom/TodayLessonsCard", () => ({ TodayLessonsCard: () => createElement("div", { "data-testid": "main-indicators" }) }));
vi.mock("@/components/bloom/StatCard", () => ({ StatCard: () => createElement("div", { "data-testid": "stat-card" }) }));
vi.mock("@/components/bloom/FinancialPrivacyToggle", () => ({ FinancialPrivacyToggle: () => null }));
vi.mock("@/components/bloom/UrgentWidget", () => ({ UrgentWidget: () => createElement("section", { "data-testid": "urgent" }) }));
vi.mock("@/components/bloom/DailyPrioritiesCard", () => ({ DailyPrioritiesCard: () => createElement("section", { "data-testid": "priorities" }) }));
vi.mock("@/components/bloom/ChecklistCard", () => ({ ChecklistCard: () => createElement("section", { "data-testid": "checklist" }) }));

import { Route } from "../src/routes/_app.index";

const TodayPage = (Route as unknown as { component: React.ComponentType }).component;
let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("Dashboard section order", () => {
  it("places one Urgent section after the main indicators and before Priorities and Checklist", async () => {
    await act(async () => { root.render(createElement(TodayPage)); });
    const indicators = container.querySelector("[data-testid='main-indicators']");
    const urgent = container.querySelectorAll("[data-testid='urgent']");
    const priorities = container.querySelector("[data-testid='priorities']");
    const checklist = container.querySelector("[data-testid='checklist']");

    expect(urgent).toHaveLength(1);
    expect(indicators?.compareDocumentPosition(urgent[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(urgent[0].compareDocumentPosition(priorities!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(priorities?.parentElement).toBe(checklist?.parentElement);
    expect(priorities?.compareDocumentPosition(checklist!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
