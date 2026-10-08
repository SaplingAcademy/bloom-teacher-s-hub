import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { Language, detectLanguage, matchLanguage, languageToLocale, t as translate, formatStatusLabel as formatStatus, formatWeekdayName as formatWeekday } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";

interface LanguageContextProps {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: string, fallback?: string) => string;
  formatStatus: (status: string | undefined | null) => string;
  formatWeekday: (day: string | undefined | null, short?: boolean) => string;
}

const LANG_KEY = "bloom.dashboard.lang";
const LANG_MANUAL_KEY = "bloom.dashboard.lang.manual";

const LanguageContext = createContext<LanguageContextProps | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  // SSR-safe initial value; the real language is resolved after hydration.
  const [lang, setLangState] = useState<Language>("pt");

  const applyLang = useCallback((next: Language) => {
    setLangState(next);
    if (typeof window !== "undefined") localStorage.setItem(LANG_KEY, next);
  }, []);

  // 1) Before any account preference is known: a manual choice made on this
  //    device wins, otherwise the browser/device locale decides.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem(LANG_KEY);
    const manual = localStorage.getItem(LANG_MANUAL_KEY) === "1";
    const savedLang = matchLanguage(saved);
    if (manual && savedLang) {
      applyLang(savedLang);
    } else {
      const nav = window.navigator;
      applyLang(detectLanguage(nav.languages?.length ? nav.languages : [nav.language]));
    }
  }, [applyLang]);

  // 2) Once signed in, profiles.locale (the teacher's saved choice) prevails.
  useEffect(() => {
    let active = true;
    async function syncFromProfile(userId: string | undefined) {
      if (!userId) return;
      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("locale")
          .eq("id", userId)
          .maybeSingle();
        const dbLang = matchLanguage(profile?.locale);
        if (active && dbLang) applyLang(dbLang);
      } catch (err) {
        console.warn("[useLanguage] Error syncing profile language:", err);
      }
    }
    supabase.auth.getUser().then(({ data }) => syncFromProfile(data.user?.id));
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" || event === "INITIAL_SESSION") syncFromProfile(session?.user?.id);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [applyLang]);

  // Manual choice: remembered on this device and saved to profiles.locale.
  const setLang = useCallback(async (newLang: Language) => {
    applyLang(newLang);
    if (typeof window !== "undefined") {
      localStorage.setItem(LANG_MANUAL_KEY, "1");
      window.dispatchEvent(new Event("storage"));
    }
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from("profiles")
          .update({ locale: languageToLocale(newLang) })
          .eq("id", user.id);
      }
    } catch (err) {
      console.warn("[useLanguage] Error persisting language to profile:", err);
    }
  }, [applyLang]);

  const t = useCallback((key: string, fallback?: string) => {
    return translate(key, lang, fallback);
  }, [lang]);

  const fmtStatus = useCallback((status: string | undefined | null) => {
    return formatStatus(status, lang);
  }, [lang]);

  const fmtWeekday = useCallback((day: string | undefined | null, short: boolean = false) => {
    return formatWeekday(day, lang, short);
  }, [lang]);

  return React.createElement(
    LanguageContext.Provider,
    { value: { lang, setLang, t, formatStatus: fmtStatus, formatWeekday: fmtWeekday } },
    children
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
