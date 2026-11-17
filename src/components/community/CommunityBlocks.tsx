import { Bookmark, HandHelping, LayoutGrid, List } from "lucide-react";
import { isCommunityTopic, type CommunityFilter } from "@/lib/community-topics";
import { communityFilterLabel } from "./CommunityFilterBar";
import { HelpArt, TopicCover } from "./CommunityCovers";

export type CommunityLayout = "blocks" | "feed";

interface BlocksProps {
  filters: readonly CommunityFilter[];
  counts: Record<string, number>;
  active: CommunityFilter;
  onOpen: (filter: CommunityFilter) => void;
  t: (key: string) => string;
}

/**
 * "Blocos": the existing filters, organized by role.
 * - "Tudo" / "Salvos" are navigation, not subjects: discreet links, no cover.
 * - "Ajude outro professor": a featured horizontal block above the subjects.
 * - The subjects (topics): tiles with an abstract cover, title, short description and post count.
 * Every count is the same number the feed shows after clicking (same filter + search).
 */
export function CommunityBlocks({ filters, counts, active, onOpen, t }: BlocksProps) {
  const countLabel = (n: number) => (n === 1 ? t("communityV1.blockCountOne") : t("communityV1.blockCount").replace("{count}", String(n)));
  const nav = filters.filter((f) => f === "all" || f === "saved");
  const topics = filters.filter(isCommunityTopic);
  const help = filters.includes("help");
  return (
    <div data-testid="community-blocks" className="space-y-4">
      {nav.length > 0 && (
        <nav aria-label={t("communityV1.filtersLabel")} className="flex flex-wrap items-center gap-1" data-testid="community-blocks-nav">
          {nav.map((f) => (
            <button key={f} type="button" data-community-block={f} aria-pressed={active === f} onClick={() => onOpen(f)}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition-colors cursor-pointer ${
                active === f ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}>
              {f === "saved" && <Bookmark className="h-3.5 w-3.5" aria-hidden="true" />}
              {communityFilterLabel(f, t)}
              {counts[f] !== undefined && <span className="tabular-nums text-xs opacity-70">· {counts[f]}</span>}
            </button>
          ))}
        </nav>
      )}

      {help && (
        <button type="button" data-community-block="help" data-community-featured="" onClick={() => onOpen("help")}
          className="group relative flex min-h-[7.5rem] w-full items-center overflow-hidden rounded-lg bg-primary text-left text-primary-foreground transition-shadow cursor-pointer hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
          <span className="relative z-[1] max-w-[62%] space-y-1.5 p-5 sm:max-w-[58%]">
            <span className="flex items-center gap-2 font-display text-lg font-semibold">
              <HandHelping className="h-5 w-5 shrink-0" aria-hidden="true" />
              {t("communityV1.filterHelp")}
            </span>
            <span className="block text-sm leading-relaxed text-primary-foreground/85">{t("communityV1.helpBlockDescription")}</span>
            {counts.help !== undefined && <span className="block text-xs tabular-nums text-primary-foreground/70">{countLabel(counts.help)}</span>}
          </span>
          <span className="absolute inset-y-0 right-0 w-1/2 sm:w-[45%]"><HelpArt /></span>
        </button>
      )}

      {topics.length > 0 && (
        <div role="list" aria-label={t("communityV1.subjectsLabel")} className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {topics.map((topic) => (
            <div role="listitem" key={topic}>
              <button type="button" data-community-block={topic} onClick={() => onOpen(topic)}
                className={`flex h-full w-full flex-col overflow-hidden rounded-lg border bg-card text-left transition-colors cursor-pointer hover:border-primary/50 ${
                  active === topic ? "border-primary/60" : "border-border/70"
                }`}>
                <TopicCover topic={topic} />
                <span className="flex flex-1 flex-col gap-1 p-4">
                  <span className="font-display text-base font-semibold text-foreground">{communityFilterLabel(topic, t)}</span>
                  <span className="text-sm leading-snug text-muted-foreground">{t(`communityV1.topicDescriptions.${topic}`)}</span>
                  {counts[topic] !== undefined && <span className="mt-auto pt-1 text-xs text-muted-foreground tabular-nums">{countLabel(counts[topic])}</span>}
                </span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Discreet two-icon switch between "Blocos" and "Feed" (no reload). */
export function CommunityLayoutToggle({ value, onChange, t }: { value: CommunityLayout; onChange: (next: CommunityLayout) => void; t: (key: string) => string }) {
  const options = [
    { id: "blocks" as const, icon: LayoutGrid, label: t("communityV1.layoutBlocks") },
    { id: "feed" as const, icon: List, label: t("communityV1.layoutFeed") },
  ];
  return (
    <div role="group" aria-label={t("communityV1.layoutLabel")} data-testid="community-layout-toggle" className="flex shrink-0 rounded-lg border border-border/70 bg-card p-0.5">
      {options.map(({ id, icon: Icon, label }) => (
        <button key={id} type="button" aria-pressed={value === id} aria-label={label} title={label} onClick={() => onChange(id)}
          className={`grid h-8 w-8 place-items-center rounded-md transition-colors cursor-pointer ${
            value === id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
          }`}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
