import { Bookmark, HandHelping, LayoutGrid, List } from "lucide-react";
import type { CommunityFilter } from "@/lib/community-topics";
import { communityFilterLabel } from "./CommunityFilterBar";

export type CommunityLayout = "blocks" | "feed";

interface BlocksProps {
  filters: readonly CommunityFilter[];
  counts: Record<string, number>;
  active: CommunityFilter;
  onOpen: (filter: CommunityFilter) => void;
  t: (key: string) => string;
}

/**
 * "Blocos": the existing categories/filters as larger tiles. A tile shows the same number of posts the
 * feed shows after clicking it (same filter + search); clicking opens that filter in the feed.
 */
export function CommunityBlocks({ filters, counts, active, onOpen, t }: BlocksProps) {
  const countLabel = (n: number) => (n === 1 ? t("communityV1.blockCountOne") : t("communityV1.blockCount").replace("{count}", String(n)));
  return (
    <div role="list" aria-label={t("communityV1.filtersLabel")} data-testid="community-blocks" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {filters.map((f) => (
        <div role="listitem" key={f}>
          <button type="button" data-community-block={f} onClick={() => onOpen(f)}
            className={`flex h-full w-full flex-col items-start gap-1.5 rounded-lg border bg-card p-4 text-left transition-colors cursor-pointer hover:border-primary/50 hover:bg-primary/5 ${
              active === f ? "border-primary/60" : "border-border/70"
            }`}>
            <span className="flex items-center gap-2 font-display text-base font-semibold text-foreground">
              {f === "help" && <HandHelping className="h-4 w-4 text-accent" aria-hidden="true" />}
              {f === "saved" && <Bookmark className="h-4 w-4 text-primary" aria-hidden="true" />}
              {communityFilterLabel(f, t)}
            </span>
            {counts[f] !== undefined && <span className="text-xs text-muted-foreground tabular-nums">{countLabel(counts[f])}</span>}
          </button>
        </div>
      ))}
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
