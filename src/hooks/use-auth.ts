import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { resolveTeacherName, sanitizeTeacherName, getMetadataName } from "@/lib/teacher-name";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  profile: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  error: any;
  signOut: () => Promise<void>;
  setLocalUser: (user: User | null) => void;
  retryProfileSync: () => Promise<void>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updateProfileState: (partialProfile: any) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const defaultProfile = {
  photo: "",
  name: "Educator",
  headline: "ESL Teacher / Language Coach",
  bio: "Passionate language educator helping students achieve fluency.",
  country: "Brazil",
  teachingAreas: [] as string[],
  subjectsTaught: [] as string[],
  experience: 1,
  linkedin: "",
  twitter: "",
  github: "",
  website: "",
};

export type OnboardingStatusType = "completed" | "skipped" | "in_progress" | "pending";

export interface OnboardingStatusResult {
  status: OnboardingStatusType;
  isCompletedOrSkipped: boolean;
  isCompleted: boolean;
  isSkipped: boolean;
}

/**
 * Checks the canonical onboarding status for a given user from Supabase.
 * Primary Source of Truth: Supabase `onboarding` table (`answers.status`).
 * - "completed" -> completed
 * - "skipped"   -> skipped
 * - "in_progress" -> pending/in_progress
 * Legacy Fallback: Supabase `profiles` table (`onboarding_completed` === true -> completed).
 * Note: localStorage is NEVER used for decision-making.
 */
export async function checkUserOnboardingStatus(userId: string): Promise<OnboardingStatusResult> {
  try {
    const [{ data: legacyData }, { data: onboardingRecord }] = await Promise.all([
      supabase
        .from("profiles")
        .select("onboarding_completed")
        .eq("id", userId)
        .maybeSingle(),
      supabase
        .from("onboarding")
        .select("answers")
        .eq("teacher_id", userId)
        .maybeSingle(),
    ]);

    const onboardingAnswers = onboardingRecord?.answers || {};
    const rawStatus = onboardingAnswers.status;

    if (rawStatus === "completed") {
      return { status: "completed", isCompletedOrSkipped: true, isCompleted: true, isSkipped: false };
    }
    if (rawStatus === "skipped") {
      return { status: "skipped", isCompletedOrSkipped: true, isCompleted: false, isSkipped: true };
    }
    if (rawStatus === "in_progress") {
      return { status: "in_progress", isCompletedOrSkipped: false, isCompleted: false, isSkipped: false };
    }

    // Legacy fallback for old users: if no onboarding table status exists, check legacy profiles table
    if (legacyData?.onboarding_completed === true) {
      return { status: "completed", isCompletedOrSkipped: true, isCompleted: true, isSkipped: false };
    }

    return { status: "pending", isCompletedOrSkipped: false, isCompleted: false, isSkipped: false };
  } catch (err) {
    console.warn("[checkUserOnboardingStatus] Error checking status from database:", err);
    return { status: "pending", isCompletedOrSkipped: false, isCompleted: false, isSkipped: false };
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [profile, setProfile] = useState<any>(null);
  const [authError, setAuthError] = useState<Error | null>(null);
  const syncedUserRef = useRef<string | null>(null);
  const syncCompletedRef = useRef<string | null>(null);

  const syncProfile = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (userId: string, userEmail?: string, userMetadata?: any) => {
      if (syncedUserRef.current === userId) {
        console.log("[useAuth] Profile already synced in this session for user:", userId);
        return;
      }
      syncedUserRef.current = userId;
      try {
        console.log(`[useAuth] Fetching teacher profile from database for user: ${userId}`);
        let { data: teacherData, error: teacherError } = await supabase
          .from("teacher_profiles")
          .select("*")
          .eq("id", userId)
          .single();

        let profileData = teacherData;
        let isTableMissing = teacherError?.code === "PGRST205" || teacherError?.message?.includes("relation \"public.teacher_profiles\" does not exist");
        let usedLegacyFallback = false;

        if (teacherError && (isTableMissing || teacherError.code !== "PGRST116")) {
          // If teacher_profiles table does not exist or fetch failed with other error, attempt profiles legacy fallback
          console.warn("[useAuth] Failed to fetch from teacher_profiles. Trying legacy profiles fallback...", teacherError.message);
          const { data: legacyProfile, error: legacyError } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", userId)
            .single();

          if (!legacyError && legacyProfile) {
            profileData = {
              ...legacyProfile,
              preferred_language: legacyProfile.preferred_language || legacyProfile.locale || "pt-BR",
            };
            usedLegacyFallback = true;
            console.log("[useAuth] Legacy profiles loaded successfully:", profileData);
          } else if (legacyError?.code === "PGRST205" || legacyError?.message?.includes("relation \"public.profiles\" does not exist")) {
             // Both missing, set flag
             isTableMissing = true;
          }
        }

        if ((teacherError && !usedLegacyFallback) || !profileData) {
          const isNotFoundError =
            teacherError &&
            (teacherError.code === "PGRST116" ||
              teacherError.message?.includes("multiple (or no) rows"));

          if (isNotFoundError || isTableMissing || !profileData) {
            console.log(
              `[useAuth] Profile not found. Creating automatic profile for user on ${isTableMissing ? 'profiles' : 'teacher_profiles'}:`,
              userId,
            );

            const rawMetadataName =
              userMetadata?.full_name ||
              userMetadata?.name ||
              (userMetadata?.display_name && !userMetadata.display_name.includes("@") ? userMetadata.display_name : "");
            const fullName = rawMetadataName || "";
            const avatarUrl = userMetadata?.avatar_url || userMetadata?.picture || "";

            const targetTable = isTableMissing ? "profiles" : "teacher_profiles";
            let insertedData: any = null;
            let insertError: any = null;

            if (isTableMissing) {
              const { data, error } = await supabase
                .from("profiles")
                .insert({
                  id: userId,
                  full_name: fullName,
                  avatar_url: avatarUrl,
                  locale: "pt-BR",
                  timezone: "America/Sao_Paulo",
                  onboarding_completed: false,
                })
                .select()
                .single();
              insertedData = data;
              insertError = error;
            } else {
              const { data, error } = await supabase
                .from("teacher_profiles")
                .insert({
                  id: userId,
                  full_name: fullName,
                  avatar_url: avatarUrl,
                  preferred_language: "pt-BR",
                  timezone: "America/Sao_Paulo",
                })
                .select()
                .single();
              insertedData = data;
              insertError = error;
            }

            if (insertError) {
              console.error(
                `[useAuth] Failed to create profile automatically on ${targetTable}:`,
                insertError,
              );
              setAuthError(insertError as unknown as Error);
              throw insertError;
            } else {
              console.log(
                `[useAuth] Automatic profile created successfully on ${targetTable}:`,
                insertedData,
              );
              profileData = {
                ...insertedData,
                preferred_language: insertedData.preferred_language || insertedData.locale || "pt-BR",
              };
              setAuthError(null);
            }
          } else {
            console.error(
              "[useAuth] Teacher profile fetch failed with database error:",
              teacherError,
            );
            setAuthError(teacherError as unknown as Error);
            throw teacherError;
          }
        }

        // Fetch onboarding status and teaching languages in parallel
        const [onboardingStatusResult, { data: legacyProfileExtra }, { data: onboardingRecord }] =
          await Promise.all([
            checkUserOnboardingStatus(userId),
            supabase
              .from("profiles")
              .select("languages_taught")
              .eq("id", userId)
              .maybeSingle(),
            supabase
              .from("onboarding")
              .select("answers")
              .eq("teacher_id", userId)
              .maybeSingle(),
          ]);

        const onboardingAnswers = onboardingRecord?.answers || {};
        const isCompleted = onboardingStatusResult.isCompleted;
        const onboardingStatus = onboardingStatusResult.status;

        const languagesTaught =
          Array.isArray(legacyProfileExtra?.languages_taught) && legacyProfileExtra.languages_taught.length > 0
            ? legacyProfileExtra.languages_taught
            : Array.isArray(onboardingAnswers.languages) && onboardingAnswers.languages.length > 0
              ? onboardingAnswers.languages
              : [];

        if (profileData) {
          // Merge onboarding_completed, onboarding_status, and languages_taught into profileData for frontend compatibility
          profileData = {
            ...profileData,
            onboarding_completed: isCompleted,
            onboarding_status: onboardingStatus,
            languages_taught: languagesTaught,
          };

          console.log("[useAuth] Profile loaded/fetched from database:", profileData);
          const savedProfileStr = localStorage.getItem("bloom.profile.data");
          const currentProfile = savedProfileStr ? JSON.parse(savedProfileStr) : {};
          const metadataName = getMetadataName({ email: userEmail, user_metadata: userMetadata });
          // Priority: profile record → auth metadata → cached local value. Never derived from e-mail.
          const cleanProfileName =
            sanitizeTeacherName(profileData.full_name, userEmail) ||
            metadataName ||
            sanitizeTeacherName(currentProfile.name, userEmail) ||
            "";

          // Heal records whose stored name is empty or was derived from the e-mail.
          if (
            cleanProfileName &&
            sanitizeTeacherName(profileData.full_name, userEmail) === null &&
            profileData.id
          ) {
            const tableToHeal = usedLegacyFallback ? "profiles" : "teacher_profiles";
            const { error: healError } = await supabase
              .from(tableToHeal)
              .update({ full_name: cleanProfileName })
              .eq("id", profileData.id);
            if (healError) {
              console.warn("[useAuth] Could not persist canonical full_name:", healError.message);
            } else {
              profileData = { ...profileData, full_name: cleanProfileName };
            }
          }

          const updatedProfile = {
            ...defaultProfile,
            ...currentProfile,
            name: cleanProfileName,
            photo: profileData.avatar_url || currentProfile.photo || "",
            preferred_language: profileData.preferred_language || "pt-BR",
            timezone: profileData.timezone || "America/Sao_Paulo",
          };

          localStorage.setItem("bloom.profile.data", JSON.stringify(updatedProfile));
          console.log(`[useAuth] Onboarding status loaded: ${onboardingStatus}`);

          syncCompletedRef.current = userId;
          setProfile(profileData);
          setAuthError(null);
        }
      } catch (err: unknown) {
        console.error("[useAuth] Error in syncProfile:", err);
        const errorObj = err instanceof Error ? err : new Error(String(err));
        setAuthError(errorObj);
        throw errorObj;
      }
    },
    [],
  );

  useEffect(() => {
    const isCallback =
      typeof window !== "undefined" &&
      (window.location.search.includes("code=") ||
        window.location.search.includes("error=") ||
        window.location.hash.includes("access_token=") ||
        window.location.hash.includes("error="));

    let callbackTimeout: ReturnType<typeof setTimeout> | null = null;
    if (isCallback) {
      console.log("[useAuth] OAuth callback detected in URL. Holding loading state.");
      callbackTimeout = setTimeout(() => {
        console.log("[useAuth] OAuth callback timeout reached. Setting loading to false.");
        setLoading(false);
      }, 8000);
    }

    console.log("[useAuth] Checking initial session from Supabase...");
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        console.log("[useAuth] Initial session found/restored. User ID:", session.user.id);
        setSession(session);
        setUser(session.user);
        if (callbackTimeout) clearTimeout(callbackTimeout);
        syncProfile(session.user.id, session.user.email, session.user.user_metadata).finally(() => {
          setLoading(false);
        });
      } else {
        console.log("[useAuth] No initial Supabase session found.");
        setSession(null);
        setUser(null);
        if (!isCallback) {
          setLoading(false);
        }
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      console.log(`[useAuth] Auth state change event triggered: ${_event}`);
      if (session) {
        console.log(
          "[useAuth] Session created/restored on auth state change. User ID:",
          session.user.id,
        );
        const sameUserAlreadySynced = syncCompletedRef.current === session.user.id;
        setSession(session);
        setUser(session.user);
        if (callbackTimeout) clearTimeout(callbackTimeout);
        if (sameUserAlreadySynced) {
          // TOKEN_REFRESHED / INITIAL_SESSION for the same user: keep the app
          // rendered instead of flashing the full-screen loader.
          setLoading(false);
          return;
        }
        if (syncedUserRef.current === session.user.id) {
          // A sync for this user is already in flight; don't start a duplicate one.
          return;
        }
        setLoading(true);
        syncProfile(session.user.id, session.user.email, session.user.user_metadata).finally(() => {
          setLoading(false);
        });
      } else {
        console.log("[useAuth] No session found on auth state change.");
        syncedUserRef.current = null;
        syncCompletedRef.current = null;
        setProfile(null);
        setSession(null);
        setUser(null);
        if (callbackTimeout) clearTimeout(callbackTimeout);
        setLoading(false);
      }
    });

    return () => {
      if (callbackTimeout) clearTimeout(callbackTimeout);
      subscription.unsubscribe();
    };
  }, [syncProfile]);
  const signOut = async () => {
    setLoading(true);
    syncedUserRef.current = null;
    syncCompletedRef.current = null;
    setProfile(null);
    setAuthError(null);
    if (typeof window !== "undefined") {
      localStorage.removeItem("bloom.onboarding.completed");
      localStorage.removeItem("bloom.onboarding.skipped");
      localStorage.removeItem("bloom.onboarding.draft");
      localStorage.removeItem("bloom.onboarding.step");
      localStorage.removeItem("bloom.profile.data");
    }
    try {
      await supabase.auth.signOut();
    } finally {
      setUser(null);
      setSession(null);
      setLoading(false);
    }
  };

  const setLocalUser = (newUser: User | null) => {
    setUser(newUser);
  };

  const retryProfileSync = async () => {
    const currentUser = user || session?.user;
    if (!currentUser) return;
    setLoading(true);
    setAuthError(null);
    try {
      await syncProfile(currentUser.id, currentUser.email, currentUser.user_metadata);
    } catch (err: unknown) {
      setAuthError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  };

  const updateProfileState = (partialProfile: any) => {
    setProfile((prev: any) => {
      const updated = { ...(prev || {}), ...partialProfile };
      if (updated.onboarding_status === "completed") {
        updated.onboarding_completed = true;
      } else if (updated.onboarding_status === "skipped" || updated.onboarding_status === "in_progress" || updated.onboarding_status === "pending") {
        if (updated.onboarding_status !== "completed") {
          updated.onboarding_completed = false;
        }
      }
      return updated;
    });
  };

  return React.createElement(
    AuthContext.Provider,
    {
      value: {
        user,
        session,
        loading,
        profile,
        error: authError,
        signOut,
        setLocalUser,
        retryProfileSync,
        updateProfileState,
      },
    },
    children,
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
