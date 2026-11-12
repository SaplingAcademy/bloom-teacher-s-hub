import { Check } from "lucide-react";
import { COMMUNITY_TOPICS, type CommunityTopic } from "@/lib/community-topics";

interface Props {
  value: CommunityTopic | null;
  onChange: (topic: CommunityTopic) => void;
  /** Shows the required-topic message (set when publishing without a topic). */
  showError: boolean;
  t: (key: string) => string;
}

/** Required topic for a new post: one choice among the five topics. */
export function CommunityTopicPicker({ value, onChange, showError, t }: Props) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-sm font-medium">{t("communityV1.topic")}</legend>
      <div role="radiogroup" aria-label={t("communityV1.topic")} aria-invalid={showError} className="flex flex-wrap gap-1.5">
        {COMMUNITY_TOPICS.map((topic) => {
          const selected = value === topic;
          return (
            <button
              key={topic}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(topic)}
              // Selected: solid primary with light text and a check mark (not color alone); no color
              // transition, so it never shows a faded intermediate state.
              className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ${
                selected
                  ? "border-primary bg-primary text-primary-foreground shadow-sm hover:bg-primary hover:text-primary-foreground"
                  : "border-border bg-card text-foreground/75 transition-colors hover:border-primary/40 hover:text-foreground"
              }`}
            >
              {selected && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
              {t(`communityV1.topics.${topic}`)}
            </button>
          );
        })}
      </div>
      {showError && <p role="alert" className="text-xs text-destructive">{t("communityV1.topicRequired")}</p>}
    </fieldset>
  );
}
