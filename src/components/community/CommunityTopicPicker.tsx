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
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              {t(`communityV1.topics.${topic}`)}
            </button>
          );
        })}
      </div>
      {showError && <p role="alert" className="text-xs text-destructive">{t("communityV1.topicRequired")}</p>}
    </fieldset>
  );
}
