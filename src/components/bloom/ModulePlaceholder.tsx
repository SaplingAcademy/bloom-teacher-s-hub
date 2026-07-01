import type { LucideIcon } from "lucide-react";
import { CheckCircle2 } from "lucide-react";
import { PageHeader } from "./PageHeader";

type ModulePlaceholderProps = {
  eyebrow: string;
  title: string;
  description: string;
  icon: LucideIcon;
  planned: string[];
  goal: string;
};

export function ModulePlaceholder({
  eyebrow,
  title,
  description,
  icon: Icon,
  planned,
  goal,
}: ModulePlaceholderProps) {
  return (
    <div className="space-y-6">
      <PageHeader eyebrow={eyebrow} title={title} description={description} />

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-sm)]">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary-soft text-primary">
              <Icon className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-display text-lg font-semibold text-card-foreground">
                What we'll build here
              </h2>
              <p className="text-sm text-muted-foreground">A focused, purpose-built module.</p>
            </div>
          </div>
          <ul className="mt-5 space-y-3">
            {planned.map((item) => (
              <li key={item} className="flex items-start gap-3 text-sm text-foreground">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="flex flex-col justify-between gap-4 rounded-2xl border border-border bg-gradient-primary p-6 text-primary-foreground shadow-[var(--shadow-md)]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide opacity-80">Why it matters</p>
            <p className="mt-2 font-display text-lg font-semibold leading-snug">{goal}</p>
          </div>
          <p className="text-sm opacity-90">
            Foundation ready — this module plugs into the shared Bloom shell, design system and data
            layer as we build it out.
          </p>
        </section>
      </div>
    </div>
  );
}