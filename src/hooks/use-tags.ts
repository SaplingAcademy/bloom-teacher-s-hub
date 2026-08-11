import { useState, useEffect } from "react";

export interface Tag {
  id: string;
  name: string;
  color: string;
  icon?: string;
  isSystem?: boolean;
}

export const BRAND_COLORS = [
  {
    id: "green",
    name: "Green",
    namePt: "Verde",
    dotClass: "bg-success",
    badgeClass: "bg-success/10 text-success border-success/20 hover:bg-success/15",
  },
  {
    id: "purple",
    name: "Purple",
    namePt: "Roxo",
    dotClass: "bg-lilac",
    badgeClass: "bg-lilac-soft text-lilac border-lilac/20 hover:bg-lilac/15",
  },
  {
    id: "orange",
    name: "Orange",
    namePt: "Laranja",
    dotClass: "bg-accent",
    badgeClass: "bg-accent-soft text-accent border-accent/20 hover:bg-accent/15",
  },
  {
    id: "blue",
    name: "Blue",
    namePt: "Azul",
    dotClass: "bg-sky-500",
    badgeClass:
      "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300 border-sky-200/50 hover:bg-sky-200/40",
  },
  {
    id: "rose",
    name: "Rose",
    namePt: "Rosa",
    dotClass: "bg-rose-500",
    badgeClass:
      "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 border-rose-200/50 hover:bg-rose-200/40",
  },
  {
    id: "gray",
    name: "Gray",
    namePt: "Cinza",
    dotClass: "bg-muted-foreground",
    badgeClass: "bg-muted text-muted-foreground border-border hover:bg-muted/80",
  },
  {
    id: "yellow",
    name: "Yellow",
    namePt: "Amarelo",
    dotClass: "bg-warning",
    badgeClass: "bg-warning/10 text-warning-foreground border-warning/20 hover:bg-warning/15",
  },
  {
    id: "teal",
    name: "Teal",
    namePt: "Verde-água",
    dotClass: "bg-teal-500",
    badgeClass:
      "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300 border-teal-200/50 hover:bg-teal-200/40",
  },
];

export const TAG_ICONS = [
  { id: "Users", label: "Students / Alunos" },
  { id: "BookOpen", label: "Lessons / Aulas" },
  { id: "Wallet", label: "Finance / Finanças" },
  { id: "Megaphone", label: "Marketing" },
  { id: "User", label: "Personal / Pessoal" },
  { id: "ShieldAlert", label: "Admin" },
  { id: "CheckSquare", label: "Task / Tarefa" },
  { id: "MessageSquare", label: "Feedback" },
  { id: "Star", label: "Star / Estrela" },
  { id: "Calendar", label: "Calendar / Calendário" },
  { id: "FileText", label: "File / Arquivo" },
  { id: "Flag", label: "Priority / Prioridade" },
];

export const DEFAULT_TAGS = {
  en: {
    "tag-students": { name: "Students", color: "green", icon: "Users" },
    "tag-lessons": { name: "Lessons", color: "purple", icon: "BookOpen" },
    "tag-finance": { name: "Finance", color: "orange", icon: "Wallet" },
    "tag-marketing": { name: "Marketing", color: "blue", icon: "Megaphone" },
    "tag-personal": { name: "Personal", color: "gray", icon: "User" },
    "tag-admin": { name: "Admin", color: "rose", icon: "ShieldAlert" },
  },
  pt: {
    "tag-students": { name: "Alunos", color: "green", icon: "Users" },
    "tag-lessons": { name: "Aulas", color: "purple", icon: "BookOpen" },
    "tag-finance": { name: "Finanças", color: "orange", icon: "Wallet" },
    "tag-marketing": { name: "Marketing", color: "blue", icon: "Megaphone" },
    "tag-personal": { name: "Pessoal", color: "gray", icon: "User" },
    "tag-admin": { name: "Administrativo", color: "rose", icon: "ShieldAlert" },
  },
};

const isDefaultSystemName = (id: string, name: string) => {
  const enName = DEFAULT_TAGS.en[id as keyof typeof DEFAULT_TAGS.en]?.name;
  const ptName = DEFAULT_TAGS.pt[id as keyof typeof DEFAULT_TAGS.pt]?.name;
  return name === enName || name === ptName;
};

export function getTagColorStyles(colorId: string) {
  const found = BRAND_COLORS.find((c) => c.id === colorId);
  return found || BRAND_COLORS[5]; // Default to gray
}

export function useTags(lang: "en" | "pt" = "en") {
  const [tags, setTagsState] = useState<Tag[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem("bloom.tags");
    if (!stored) {
      const initialTags = Object.entries(DEFAULT_TAGS[lang]).map(([id, t]) => ({
        id,
        name: t.name,
        color: t.color,
        icon: t.icon,
        isSystem: true,
      }));
      setTagsState(initialTags);
      localStorage.setItem("bloom.tags", JSON.stringify(initialTags));
    } else {
      try {
        const parsed = JSON.parse(stored) as Tag[];
        let updated = false;
        const newTags = parsed.map((tag) => {
          if (tag.isSystem && isDefaultSystemName(tag.id, tag.name)) {
            const currentTranslation =
              DEFAULT_TAGS[lang][tag.id as keyof typeof DEFAULT_TAGS.en]?.name;
            if (currentTranslation && tag.name !== currentTranslation) {
              updated = true;
              return { ...tag, name: currentTranslation };
            }
          }
          return tag;
        });

        if (updated) {
          setTagsState(newTags);
          localStorage.setItem("bloom.tags", JSON.stringify(newTags));
        } else {
          setTagsState(parsed);
        }
      } catch (e) {
        console.error("Failed to parse tags", e);
      }
    }
  }, [lang]);

  const saveTags = (newTags: Tag[]) => {
    setTagsState(newTags);
    localStorage.setItem("bloom.tags", JSON.stringify(newTags));
  };

  const addTag = (newTag: Omit<Tag, "id">) => {
    const created: Tag = {
      ...newTag,
      id: `tag-${crypto.randomUUID()}`,
    };
    const updated = [...tags, created];
    saveTags(updated);
    return created;
  };

  const updateTag = (id: string, updates: Partial<Tag>) => {
    const updated = tags.map((t) => {
      if (t.id === id) {
        const isSystem = t.isSystem && updates.name === undefined; // If name changes, it is no longer auto-translated
        return { ...t, ...updates, isSystem };
      }
      return t;
    });
    saveTags(updated);
  };

  const deleteTag = (id: string) => {
    const updated = tags.filter((t) => t.id !== id);
    saveTags(updated);
  };

  return {
    tags,
    addTag,
    updateTag,
    deleteTag,
  };
}
