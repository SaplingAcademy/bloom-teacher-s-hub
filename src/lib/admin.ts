/**
 * Bloom admin panel — super_admin-only teacher/plan administration.
 *
 * All data flows through SECURITY DEFINER RPCs (list_admin_teachers /
 * set_teacher_plan) that re-verify has_role(auth.uid(), 'super_admin') in the
 * database. The UI checks below are convenience only; hiding the menu is
 * never the protection.
 */

import { supabase } from "@/lib/supabase";
import {
  FREE_PLAN_ACTIVE_STUDENT_LIMIT,
  type SubscriptionPlan,
} from "@/lib/plans";

export interface AdminTeacher {
  teacher_id: string;
  full_name: string | null;
  email: string | null;
  plan: SubscriptionPlan;
  created_at: string | null;
  active_students: number;
}

export type AdminPlanFilter = "all" | SubscriptionPlan;

export const ADMIN_TEACHERS_QUERY_KEY = ["admin", "teachers"] as const;

/** Stable markers raised by the admin RPCs, recognized without translated text. */
export const ADMIN_ONLY_ERROR_MARKER = "ADMIN_ONLY";
export const DOWNGRADE_BLOCKED_ERROR_MARKER = "DOWNGRADE_BLOCKED_ACTIVE_STUDENTS";

export function isAdminOnlyError(error: unknown): boolean {
  return hasMarker(error, ADMIN_ONLY_ERROR_MARKER);
}

export function isDowngradeBlockedError(error: unknown): boolean {
  return hasMarker(error, DOWNGRADE_BLOCKED_ERROR_MARKER);
}

function hasMarker(error: unknown, marker: string): boolean {
  if (!error || typeof error !== "object") return false;
  const message = String((error as { message?: unknown }).message ?? "");
  const details = String((error as { details?: unknown }).details ?? "");
  return message.includes(marker) || details.includes(marker);
}

/** Case-insensitive search over name and email; empty query matches all. */
export function matchesAdminSearch(
  teacher: Pick<AdminTeacher, "full_name" | "email">,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    (teacher.full_name ?? "").toLowerCase().includes(q) ||
    (teacher.email ?? "").toLowerCase().includes(q)
  );
}

/** Combined search + plan filter used by the admin teachers page. */
export function filterAdminTeachers(
  teachers: AdminTeacher[],
  search: string,
  planFilter: AdminPlanFilter,
): AdminTeacher[] {
  return teachers.filter(
    (teacher) =>
      (planFilter === "all" || teacher.plan === planFilter) &&
      matchesAdminSearch(teacher, search),
  );
}

export interface AdminStats {
  totalTeachers: number;
  freeTeachers: number;
  proTeachers: number;
  totalActiveStudents: number;
}

/** Top indicators: totals are computed over the full list, never the filtered one. */
export function computeAdminStats(teachers: AdminTeacher[]): AdminStats {
  return teachers.reduce<AdminStats>(
    (stats, teacher) => ({
      totalTeachers: stats.totalTeachers + 1,
      freeTeachers: stats.freeTeachers + (teacher.plan === "free" ? 1 : 0),
      proTeachers: stats.proTeachers + (teacher.plan === "pro" ? 1 : 0),
      totalActiveStudents: stats.totalActiveStudents + teacher.active_students,
    }),
    { totalTeachers: 0, freeTeachers: 0, proTeachers: 0, totalActiveStudents: 0 },
  );
}

/**
 * Pre-flight guard: a teacher above the free-plan active-student limit cannot
 * be downgraded. The database enforces the same rule; this only drives the UI
 * explanation before confirmation.
 */
export function canDowngradeToFree(teacher: Pick<AdminTeacher, "active_students">): boolean {
  return teacher.active_students <= FREE_PLAN_ACTIVE_STUDENT_LIMIT;
}

/** List all teachers with plan and active-student count (super_admin only). */
export async function fetchAdminTeachers(): Promise<AdminTeacher[]> {
  const { data, error } = await supabase.rpc("list_admin_teachers");
  if (error) throw error;
  return (data ?? []).map((row) => ({
    teacher_id: row.teacher_id as string,
    full_name: (row.full_name as string | null) ?? null,
    email: (row.email as string | null) ?? null,
    plan: row.plan === "pro" ? "pro" : "free",
    created_at: (row.created_at as string | null) ?? null,
    active_students: Number(row.active_students ?? 0),
  }));
}

/** Change a teacher's plan (super_admin only; database re-verifies). */
export async function setTeacherPlan(
  teacherId: string,
  plan: SubscriptionPlan,
): Promise<void> {
  const { error } = await supabase.rpc("set_teacher_plan", {
    _teacher_id: teacherId,
    _plan: plan,
  });
  if (error) throw error;
}
