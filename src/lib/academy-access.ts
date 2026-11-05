import { canAccessAcademy, type SubscriptionPlan } from "./plans";

/** Publication is independent of the plan entitlement; only admins enter now. */
export const ACADEMY_PUBLISHED = false;

export type AcademyAccess = {
  state: "coming_soon" | "construction";
  published: boolean;
};

/** Presentation rule only. Server authorization independently validates the role. */
export function canEnterAcademy(
  plan: SubscriptionPlan | null,
  isSuperAdmin: boolean,
  published: boolean = ACADEMY_PUBLISHED,
): boolean {
  return isSuperAdmin || (published && canAccessAcademy(plan, isSuperAdmin));
}