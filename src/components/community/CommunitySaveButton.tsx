import { Bookmark, BookmarkCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  saved: boolean;
  busy: boolean;
  onToggle: () => void;
  t: (key: string) => string;
}

/** Private bookmark for a post: "Salvar" ↔ "Salvo". Same button style as the post actions. */
export function CommunitySaveButton({ saved, busy, onToggle, t }: Props) {
  const Icon = saved ? BookmarkCheck : Bookmark;
  return (
    <Button
      variant="ghost"
      size="sm"
      className={`gap-1.5 ${saved ? "text-primary" : ""}`}
      disabled={busy}
      onClick={onToggle}
      aria-pressed={saved}
      aria-label={saved ? t("communityV1.unsaveLabel") : t("communityV1.saveLabel")}
      title={saved ? t("communityV1.unsaveLabel") : t("communityV1.saveLabel")}
    >
      <Icon className={`w-4 h-4 ${saved ? "fill-primary/20" : ""}`} aria-hidden="true" />
      {saved ? t("communityV1.saved") : t("communityV1.save")}
    </Button>
  );
}
