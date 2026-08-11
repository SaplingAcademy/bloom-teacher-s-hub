import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { Language, t as translate, formatStatusLabel as formatStatus, formatWeekdayName as formatWeekday } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";

interface LanguageContextProps {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: string, fallback?: string) => string;
  formatStatus: (status: string | undefined | null) => string;
  formatWeekday: (day: string | undefined | null, short?: boolean) => string;
}

const LanguageContext = createContext<LanguageContextProps | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Language>("pt"); // Default to Portuguese for Bloom Brazil

  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("bloom.dashboard.lang");
      if (saved === "en" || saved === "pt") {
        setLangState(saved);
      } else {
        const browserLang = window.navigator.language || "";
        if (browserLang.toLowerCase().startsWith("pt")) {
          setLangState("pt");
          localStorage.setItem("bloom.dashboard.lang", "pt");
        } else {
          setLangState("pt"); // Default platform preference is Portuguese
          localStorage.setItem("bloom.dashboard.lang", "pt");
        }
      }
    }
  }, []);

  // Listen to Supabase auth session to sync preferred_language from user profile
  useEffect(() => {
    async function syncFromProfile() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("preferred_language, locale")
            .eq("id", user.id)
            .maybeSingle();

          const dbLang = profile?.preferred_language || profile?.locale;
          if (dbLang) {
            const parsedLang: Language = String(dbLang).toLowerCase().startsWith("pt") ? "pt" : "en";
            setLangState(parsedLang);
            if (typeof window !== "undefined") {
              localStorage.setItem("bloom.dashboard.lang", parsedLang);
            }
          }
        }
      } catch (err) {
        console.warn("[useLanguage] Error syncing profile language:", err);
      }
    }
    syncFromProfile();
  }, []);

  const setLang = useCallback(async (newLang: Language) => {
    setLangState(newLang);
    if (typeof window !== "undefined") {
      localStorage.setItem("bloom.dashboard.lang", newLang);
      window.dispatchEvent(new Event("storage"));
    }

    // Persist to user profile in Supabase if logged in
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const prefVal = newLang === "pt" ? "pt-BR" : "en-US";
        await supabase
          .from("profiles")
          .update({ preferred_language: prefVal, locale: prefVal })
          .eq("id", user.id);
      }
    } catch (err) {
      console.warn("[useLanguage] Error persisting language to profile:", err);
    }
  }, []);

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
