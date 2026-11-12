import { HandHelping } from "lucide-react";
import { COMMUNITY_FILTERS, type CommunityFilter } from "@/lib/community-topics";

interface Props {
  value: CommunityFilter;
  onChange: (filter: CommunityFilter) => void;
  /** Unanswered questions: badge on "Ajude outro professor". */
  helpCount: number;
  t: (key: string) => string;
}

/** Tudo + the five topics + "Ajude outro professor". Scrolls sideways on phones, wraps from sm up. */
export function CommunityFilterBar({ value, onChange, helpCount, t }: Props) {
  const label = (f: CommunityFilter) =>
    f === "all" ? t("communityV1.filterAll") : f === "help" ? t("communityV1.filterHelp") : t(`communityV1.topics.${f}`);
  return (
    <div
      role="group"
      aria-label={t("communityV1.filtersLabel")}
      className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0"
    >
      {COMMUNITY_FILTERS.map((f) => {
        const active = value === f;
        return (
          <button
            key={f}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(f)}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
              active
                ? "border-primary bg-primary text-primary-foreground"
                : f === "help"
                  ? "border-accent/40 bg-accent/10 text-foreground hover:bg-accent/20"
                  : "border-border bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            {f === "help" && <HandHelping className="h-3.5 w-3.5" aria-hidden="true" />}
            {label(f)}
            {f === "help" && helpCount > 0 && (
              <span className={`rounded-full px-1.5 text-[10px] font-bold tabular-nums ${active ? "bg-primary-foreground/20" : "bg-accent text-accent-foreground"}`}>
                {helpCount}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
