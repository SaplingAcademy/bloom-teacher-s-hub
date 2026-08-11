import React, { createContext, useContext, useState, useEffect } from "react";

type Language = "en" | "pt";

interface LanguageContextProps {
  lang: Language;
  setLang: (lang: Language) => void;
}

const LanguageContext = createContext<LanguageContextProps | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Language>("en");

  // Run on mount to detect browser/OS language and read from localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("bloom.dashboard.lang");
      if (saved === "en" || saved === "pt") {
        setLangState(saved);
      } else {
        // Automatic Language Detection
        const browserLang = window.navigator.language || "";
        if (browserLang.toLowerCase().startsWith("pt")) {
          setLangState("pt");
          localStorage.setItem("bloom.dashboard.lang", "pt");
        } else {
          setLangState("en");
          localStorage.setItem("bloom.dashboard.lang", "en");
        }
      }
    }
  }, []);

  const setLang = (newLang: Language) => {
    setLangState(newLang);
    if (typeof window !== "undefined") {
      localStorage.setItem("bloom.dashboard.lang", newLang);
    }
  };

  return React.createElement(LanguageContext.Provider, { value: { lang, setLang } }, children);
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
