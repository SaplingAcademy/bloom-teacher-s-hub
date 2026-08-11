import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

export interface TeacherLanguageOption {
  id: string; // e.g. "English" or "Inglês"
  labelEn: string;
  labelPt: string;
}

export const CANONICAL_LANGUAGES: TeacherLanguageOption[] = [
  { id: "English", labelEn: "English", labelPt: "Inglês" },
  { id: "Spanish", labelEn: "Spanish", labelPt: "Espanhol" },
  { id: "French", labelEn: "French", labelPt: "Francês" },
  { id: "Italian", labelEn: "Italian", labelPt: "Italiano" },
  { id: "German", labelEn: "German", labelPt: "Alemão" },
  { id: "Japanese", labelEn: "Japanese", labelPt: "Japonês" },
  { id: "Korean", labelEn: "Korean", labelPt: "Coreano" },
  { id: "Portuguese", labelEn: "Portuguese", labelPt: "Português" },
  { id: "Mandarin", labelEn: "Mandarin", labelPt: "Mandarim" },
  { id: "Russian", labelEn: "Russian", labelPt: "Russo" },
  { id: "Arabic", labelEn: "Arabic", labelPt: "Árabe" },
];

const LANGUAGE_LABEL_MAP: Record<string, { en: string; pt: string }> = {
  English: { en: "English", pt: "Inglês" },
  Spanish: { en: "Spanish", pt: "Espanhol" },
  French: { en: "French", pt: "Francês" },
  Italian: { en: "Italian", pt: "Italiano" },
  German: { en: "German", pt: "Alemão" },
  Japanese: { en: "Japanese", pt: "Japonês" },
  Korean: { en: "Korean", pt: "Coreano" },
  Portuguese: { en: "Portuguese", pt: "Português" },
  Mandarin: { en: "Mandarin", pt: "Mandarim" },
  Russian: { en: "Russian", pt: "Russo" },
  Arabic: { en: "Arabic", pt: "Árabe" },
};

export function useTeacherLanguages() {
  const { user, profile, updateProfileState, loading: authLoading } = useAuth();
  const [languages, setLanguages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Sync state from profile/auth context
  useEffect(() => {
    if (profile?.languages_taught && Array.isArray(profile.languages_taught)) {
      setLanguages(profile.languages_taught);
      setLoading(false);
    } else if (!authLoading) {
      setLoading(false);
    }
  }, [profile, authLoading]);

  // Format helper for display
  const formatLanguageLabel = useCallback((langId: string, uiLang: "en" | "pt" = "pt") => {
    if (!langId) return "";
    const mapEntry = LANGUAGE_LABEL_MAP[langId];
    if (mapEntry) {
      return uiLang === "pt" ? mapEntry.pt : mapEntry.en;
    }
    return langId;
  }, []);

  // Update languages in Supabase and in AuthContext state
  const updateTeacherLanguages = useCallback(
    async (newLanguages: string[]) => {
      const userId = user?.id;
      if (!userId) return false;

      try {
        setLoading(true);
        // 1. Update profiles table
        const { error: profileErr } = await supabase
          .from("profiles")
          .update({ languages_taught: newLanguages })
          .eq("id", userId);

        if (profileErr) throw profileErr;

        // 2. Fetch existing onboarding record to merge
        const { data: record } = await supabase
          .from("onboarding")
          .select("answers")
          .eq("teacher_id", userId)
          .maybeSingle();

        const answers = record?.answers || {};
        await supabase.from("onboarding").upsert(
          {
            teacher_id: userId,
            answers: {
              ...answers,
              languages: newLanguages,
              updated_at: new Date().toISOString(),
            },
          },
          { onConflict: "teacher_id" }
        );

        // 3. Update Auth context profile state
        updateProfileState({ languages_taught: newLanguages });
        setLanguages(newLanguages);
        toast.success("Idiomas de ensino atualizados!");
        return true;
      } catch (err: any) {
        console.error("[useTeacherLanguages] Error updating languages:", err);
        toast.error("Erro ao atualizar idiomas: " + err.message);
        return false;
      } finally {
        setLoading(false);
      }
    },
    [user, updateProfileState]
  );

  // Check if a language is currently in use across students, classes, leads
  const checkLanguageInUse = useCallback(
    async (langId: string) => {
      const userId = user?.id;
      if (!userId || !langId) return { inUse: false, details: [] };

      const details: string[] = [];

      try {
        // Query students
        const { data: studentsData } = await supabase
          .from("students")
          .select("id, full_name, focus")
          .eq("teacher_id", userId);

        if (studentsData) {
          const matchingStudents = studentsData.filter(
            (s) => s.focus === langId || s.focus?.toLowerCase().includes(langId.toLowerCase())
          );
          if (matchingStudents.length > 0) {
            details.push(`${matchingStudents.length} aluno(s)`);
          }
        }

        // Query leads
        const { data: leadsData } = await supabase
          .from("leads")
          .select("id, full_name, language_studied")
          .eq("teacher_id", userId);

        if (leadsData) {
          const matchingLeads = leadsData.filter(
            (l) => l.language_studied === langId || l.language_studied?.toLowerCase().includes(langId.toLowerCase())
          );
          if (matchingLeads.length > 0) {
            details.push(`${matchingLeads.length} lead(s)`);
          }
        }

        return {
          inUse: details.length > 0,
          details,
        };
      } catch (err) {
        console.warn("[useTeacherLanguages] Error checking language usage:", err);
        return { inUse: false, details: [] };
      }
    },
    [user]
  );

  return {
    languages,
    hasConfiguredLanguages: languages.length > 0,
    loading: loading || authLoading,
    formatLanguageLabel,
    updateTeacherLanguages,
    checkLanguageInUse,
  };
}
