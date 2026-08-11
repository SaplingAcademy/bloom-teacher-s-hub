import { DEFAULT_SUBJECT_GARDENS, DEFAULT_THEMATIC_GARDENS } from "@/lib/community-ecosystem";

export interface AutoTagResult {
  detectedSubjectGardenId?: string;
  detectedSubjectName?: string;
  detectedThematicGardenIds: string[];
  detectedThematicNames: string[];
  detectedAudience?: string;
  detectedLevel?: string;
  detectedModality?: string;
  detectedLanguage: string;
  suggestedTags: string[];
}

/**
 * Bloom AI Auto-Tagging Engine
 * Analyzes title and content text to detect subjects, thematic gardens, level, and tags automatically.
 */
export function analyzeAndAutoTagPost(title: string, content: string): AutoTagResult {
  const text = `${title} ${content}`.toLowerCase();

  let detectedSubjectGardenId: string | undefined = "sg-en"; // Default English
  let detectedSubjectName: string | undefined = "Inglês";
  const detectedThematicGardenIds: string[] = [];
  const detectedThematicNames: string[] = [];
  const suggestedTags: string[] = [];

  // 1. Detect Subject
  if (text.includes("espanhol") || text.includes("spanish")) {
    detectedSubjectGardenId = "sg-es";
    detectedSubjectName = "Espanhol";
    suggestedTags.push("Espanhol");
  } else if (text.includes("francês") || text.includes("french")) {
    detectedSubjectGardenId = "sg-fr";
    detectedSubjectName = "Francês";
    suggestedTags.push("Francês");
  } else if (text.includes("alemão") || text.includes("german")) {
    detectedSubjectGardenId = "sg-de";
    detectedSubjectName = "Alemão";
    suggestedTags.push("Alemão");
  } else if (text.includes("japonês") || text.includes("japanese")) {
    detectedSubjectGardenId = "sg-ja";
    detectedSubjectName = "Japonês";
    suggestedTags.push("Japonês");
  } else if (text.includes("matemática") || text.includes("math")) {
    detectedSubjectGardenId = "sg-ma";
    detectedSubjectName = "Matemática";
    suggestedTags.push("Matemática");
  } else {
    suggestedTags.push("Inglês");
  }

  // 2. Detect Audience
  let detectedAudience: string | undefined;
  if (text.includes("criança") || text.includes("kids") || text.includes("infantil")) {
    detectedAudience = "Kids (Crianças)";
    detectedThematicGardenIds.push("tg-kids");
    detectedThematicNames.push("Crianças (Kids)");
    suggestedTags.push("Kids");
  } else if (text.includes("teen") || text.includes("adolescente")) {
    detectedAudience = "Adolescentes (Teens)";
    detectedThematicGardenIds.push("tg-teens");
    detectedThematicNames.push("Adolescentes (Teens)");
    suggestedTags.push("Teens");
  } else if (text.includes("adulto") || text.includes("adult")) {
    detectedAudience = "Adultos";
    detectedThematicGardenIds.push("tg-adults");
    detectedThematicNames.push("Adultos");
    suggestedTags.push("Adultos");
  }

  // 3. Detect Methodology & Theme
  if (text.includes("negócio") || text.includes("business") || text.includes("empresa")) {
    detectedThematicGardenIds.push("tg-business");
    detectedThematicNames.push("Inglês para Negócios");
    suggestedTags.push("Business English");
  }

  if (text.includes("conversação") || text.includes("speaking") || text.includes("fluência")) {
    detectedThematicGardenIds.push("tg-conversation");
    detectedThematicNames.push("Conversação & Fluência");
    suggestedTags.push("Conversação");
  }

  if (text.includes("gramática") || text.includes("grammar") || text.includes("present perfect") || text.includes("past simple")) {
    detectedThematicGardenIds.push("tg-grammar");
    detectedThematicNames.push("Gramática Prática");
    suggestedTags.push("Gramática");
  }

  if (text.includes("jogo") || text.includes("game") || text.includes("gamificação")) {
    detectedThematicGardenIds.push("tg-gamification");
    detectedThematicNames.push("Gamificação");
    suggestedTags.push("Gamificação");
  }

  if (text.includes("ia") || text.includes("ai") || text.includes("inteligência artificial") || text.includes("chatgpt")) {
    detectedThematicGardenIds.push("tg-ai");
    detectedThematicNames.push("Inteligência Artificial");
    suggestedTags.push("IA na Educação");
  }

  // 4. Detect CEFR Level
  let detectedLevel: string | undefined = "B1";
  if (text.includes("iniciante") || text.includes("a1") || text.includes("a2")) {
    detectedLevel = "A1 / A2 Iniciante";
  } else if (text.includes("avançado") || text.includes("c1") || text.includes("c2")) {
    detectedLevel = "C1 / C2 Avançado";
  }

  // 5. Detect Modality
  let detectedModality: string | undefined = "Online";
  if (text.includes("presencial") || text.includes("in person")) {
    detectedModality = "Presencial";
  }

  return {
    detectedSubjectGardenId,
    detectedSubjectName,
    detectedThematicGardenIds,
    detectedThematicNames,
    detectedAudience,
    detectedLevel,
    detectedModality,
    detectedLanguage: "pt-BR",
    suggestedTags: Array.from(new Set(suggestedTags)),
  };
}
