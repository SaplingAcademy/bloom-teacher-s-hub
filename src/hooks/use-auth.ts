import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { sanitizeTeacherName, getMetadataName } from "@/lib/teacher-name";
import { ensureStorageOwner, getUserItem, setUserItem, purgeBloomLocalData } from "@/lib/user-storage";

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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [profile, setProfile] = useState<any>(null);
  const [authError, setAuthError] = useState<Error | null>(null);
  const syncedUserRef = useRef<string | null>(null);
  const syncCompletedRef = useRef<string | null>(null);

  /**
   * Loads the teacher profile from public.profiles — the single canonical source.
   * Never creates the row from the browser and never infers/heals the name:
   * the row is created by the database on signup. A missing row is an error
   * surfaced to the user with "Try again".
   */
  const syncProfile = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (userId: string, userEmail?: string, userMetadata?: any) => {
      if (syncedUserRef.current === userId) {
        return;
      }
      syncedUserRef.current = userId;
      ensureStorageOwner(userId);
      try {
        const [{ data: profileRow, error: profileError }, { data: onboardingRecord }] =
          await Promise.all([
            supabase
              .from("profiles")
              .select(
                "id, full_name, avatar_url, bio, languages_taught, timezone, locale, onboarding_completed, created_at, updated_at",
              )
              .eq("id", userId)
              .maybeSingle(),
            supabase.from("onboarding").select("answers").eq("teacher_id", userId).maybeSingle(),
          ]);

        if (profileError) throw profileError;
        if (!profileRow) {
          throw new Error(
            "Perfil não encontrado para esta conta. Tente novamente em instantes ou entre em contato com o suporte.",
          );
        }

        const onboardingAnswers = onboardingRecord?.answers || {};
        const isCompleted =
          Boolean(profileRow.onboarding_completed) || onboardingAnswers.status === "completed";
        const onboardingStatus =
          onboardingAnswers.status || (isCompleted ? "completed" : "not_started");
        const languagesTaught =
          Array.isArray(profileRow.languages_taught) && profileRow.languages_taught.length > 0
            ? profileRow.languages_taught
            : Array.isArray(onboardingAnswers.languages) && onboardingAnswers.languages.length > 0
              ? onboardingAnswers.languages
              : [];
        const locale = profileRow.locale || "pt-BR";

        const profileData = {
          ...profileRow,
          // Derived for UI compatibility only; persisted column is `locale`.
          preferred_language: locale,
          onboarding_completed: isCompleted,
          onboarding_status: onboardingStatus,
          languages_taught: languagesTaught,
        };

        // Cache is scoped to this user id; it never feeds the name or any DB write.
        const savedProfileStr = getUserItem("bloom.profile.data", userId);
        let currentProfile: Record<string, unknown> = {};
        try {
          currentProfile = savedProfileStr ? JSON.parse(savedProfileStr) : {};
        } catch {
          currentProfile = {};
        }
        // Display name: profiles.full_name → this user's Auth metadata → empty (neutral UI fallback).
        const displayName =
          sanitizeTeacherName(profileRow.full_name, userEmail) ||
          getMetadataName({ email: userEmail, user_metadata: userMetadata }) ||
          "";

        const updatedProfile = {
          ...defaultProfile,
          ...currentProfile,
          name: displayName,
          photo: profileRow.avatar_url || (currentProfile.photo as string) || "",
          preferred_language: locale,
          timezone: profileRow.timezone || "America/Sao_Paulo",
        };
        setUserItem("bloom.profile.data", JSON.stringify(updatedProfile), userId);

        if (isCompleted) {
          localStorage.setItem("bloom.onboarding.completed", "true");
          localStorage.removeItem("bloom.onboarding.skipped");
        } else if (onboardingStatus === "skipped") {
          localStorage.setItem("bloom.onboarding.skipped", "true");
          localStorage.removeItem("bloom.onboarding.completed");
        } else {
          localStorage.removeItem("bloom.onboarding.completed");
        }

        syncCompletedRef.current = userId;
        setProfile(profileData);
        setAuthError(null);
      } catch (err: unknown) {
        console.error("[useAuth] Error loading profile:", err);
        // Allow "Try again" to re-run the load for this user.
        syncedUserRef.current = null;
        const errorObj =
          err instanceof Error
            ? err
            : new Error((err as { message?: string })?.message || String(err));
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
        ensureStorageOwner(session.user.id);
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
        ensureStorageOwner(session.user.id);
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
        if (_event === "SIGNED_OUT") purgeBloomLocalData();
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
    try {
      await supabase.auth.signOut();
    } finally {
      purgeBloomLocalData();
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
      if (updated.onboarding_completed) {
        localStorage.setItem("bloom.onboarding.completed", "true");
        localStorage.removeItem("bloom.onboarding.skipped");
      } else if (updated.onboarding_status === "skipped") {
        localStorage.setItem("bloom.onboarding.skipped", "true");
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
