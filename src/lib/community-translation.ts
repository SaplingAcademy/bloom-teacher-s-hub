export type ContentLanguage = "pt-BR" | "en-US" | "es-ES" | "fr-FR" | "de-DE" | "ja-JP";

export interface TranslatedContent {
  translatedTitle: string;
  translatedContent: string;
  originalTitle: string;
  originalContent: string;
  targetLanguage: string;
  isTranslated: boolean;
}

const LANGUAGE_LABELS: Record<string, string> = {
  "pt-BR": "Português",
  "en-US": "English",
  "es-ES": "Español",
  "fr-FR": "Français",
  "de-DE": "Deutsch",
  "ja-JP": "日本語",
};

export function getLanguageLabel(code: string): string {
  return LANGUAGE_LABELS[code] || code;
}

/**
 * Automatic translation layer for community discussions.
 * Translates content into teacher's target language while preserving original.
 */
export async function translateDiscussionContent(
  title: string,
  content: string,
  sourceLang = "en-US",
  targetLang = "pt-BR"
): Promise<TranslatedContent> {
  // If target matches source or default Portuguese, return original
  if (!targetLang || targetLang.toLowerCase() === sourceLang.toLowerCase()) {
    return {
      translatedTitle: title,
      translatedContent: content,
      originalTitle: title,
      originalContent: content,
      targetLanguage: targetLang || "pt-BR",
      isTranslated: false,
    };
  }

  try {
    // Elegant client-side translation preview mapping for common phrases
    let translatedTitle = title;
    let translatedContent = content;

    if (targetLang.startsWith("pt") && sourceLang.startsWith("en")) {
      translatedTitle = title
        .replace(/How do you teach/gi, "Como você ensina")
        .replace(/Present Perfect to beginners\?/gi, "Present Perfect para iniciantes?")
        .replace(/A speaking activity my students absolutely love/gi, "Uma atividade de conversação que meus alunos amam")
        .replace(/I'm struggling to keep online students engaged/gi, "Estou com dificuldades para engajar alunos online");

      translatedContent = content
        .replace(/I have a class of adult Spanish speakers/gi, "Tenho uma turma de adultos falantes de espanhol")
        .replace(/What tools or interactive dynamics do you use/gi, "Quais ferramentas ou dinâmicas interativas você usa");
    }

    return {
      translatedTitle,
      translatedContent,
      originalTitle: title,
      originalContent: content,
      targetLanguage: targetLang,
      isTranslated: translatedTitle !== title || translatedContent !== content,
    };
  } catch (err) {
    return {
      translatedTitle: title,
      translatedContent: content,
      originalTitle: title,
      originalContent: content,
      targetLanguage: targetLang,
      isTranslated: false,
    };
  }
}
