import { createFileRoute } from "@tanstack/react-router";
import {
  Users,
  Wallet,
  UserPlus,
  CalendarClock,
  Clock,
  Video,
  CheckCircle2,
  Circle,
  Sparkles,
  ArrowUpRight,
} from "lucide-react";
import { PageHeader } from "@/components/bloom/PageHeader";
import { StatCard } from "@/components/bloom/StatCard";
import { PanelCard } from "@/components/bloom/PanelCard";

export const Route = createFileRoute("/_app/")({
  head: () => ({
    meta: [
      { title: "Today · Bloom" },
      { name: "description", content: "Your teaching day at a glance — classes, tasks and quick actions." },
    ],
  }),
  component: TodayPage,
});

const classes = [
  { time: "09:00", student: "Sofia Almeida", topic: "Business English · B2", mode: "Online" },
  { time: "11:30", student: "Group A2 (4)", topic: "Past tenses review", mode: "Online" },
  { time: "14:00", student: "Lucas Meyer", topic: "Conversation · C1", mode: "In person" },
  { time: "16:30", student: "Yuki Tanaka", topic: "IELTS prep · Writing", mode: "Online" },
];

const tasks = [
  { label: "Send invoice to Lucas Meyer", done: false },
  { label: "Prepare A2 group worksheet", done: false },
  { label: "Reply to new lead from Instagram", done: false },
  { label: "Confirm Friday schedule with Sofia", done: true },
];

function TodayPage() {
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={today}
        title="Good morning, Maria 🌱"
        description="Here's everything that needs you today. Bloom keeps the busywork out of your way."
        actions={
          <button className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-warm px-4 py-2.5 text-sm font-semibold text-accent-foreground shadow-[var(--shadow-sm)] transition-transform hover:-translate-y-0.5">
            <Sparkles className="h-4 w-4" /> Plan my day with AI
          </button>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Classes today" value="4" icon={CalendarClock} tone="primary" hint="Next at 09:00" />
        <StatCard label="Active students" value="28" icon={Users} tone="lilac" trend={{ value: "+3", positive: true }} />
        <StatCard label="New leads" value="5" icon={UserPlus} tone="accent" trend={{ value: "+2", positive: true }} />
        <StatCard label="This month" value="$3,240" icon={Wallet} tone="warning" trend={{ value: "+12%", positive: true }} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <PanelCard
          title="Today's schedule"
          description="4 classes · 5 hours"
          icon={<CalendarClock className="h-4 w-4" />}
          action={{ label: "Open calendar", to: "/calendar" }}
          contentClassName="p-0"
        >
          <ul className="divide-y divide-border/70">
            {classes.map((c) => (
              <li key={c.time} className="flex items-center gap-4 px-5 py-3.5">
                <div className="flex w-14 shrink-0 flex-col">
                  <span className="font-display text-sm font-bold text-foreground">{c.time}</span>
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Clock className="h-3 w-3" /> 60m
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">{c.student}</p>
                  <p className="truncate text-xs text-muted-foreground">{c.topic}</p>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground">
                  {c.mode === "Online" && <Video className="h-3 w-3" />}
                  {c.mode}
                </span>
              </li>
            ))}
          </ul>
        </PanelCard>

        <div className="space-y-5">
          <PanelCard
            title="Tasks"
            description="3 to go"
            icon={<CheckCircle2 className="h-4 w-4" />}
            contentClassName="p-3"
          >
            <ul className="space-y-1">
              {tasks.map((t) => (
                <li
                  key={t.label}
                  className="flex items-center gap-3 rounded-xl px-2 py-2 text-sm transition-colors hover:bg-secondary"
                >
                  {t.done ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                  ) : (
                    <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className={t.done ? "text-muted-foreground line-through" : "text-foreground"}>
                    {t.label}
                  </span>
                </li>
              ))}
            </ul>
          </PanelCard>

          <div className="rounded-2xl border border-border bg-gradient-lilac p-5 text-lilac-foreground shadow-[var(--shadow-md)]">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              <p className="text-xs font-semibold uppercase tracking-wide opacity-90">Bloom AI tip</p>
            </div>
            <p className="mt-2 text-sm font-medium leading-snug">
              Yuki's IELTS test is in 3 weeks. Want me to draft a focused writing plan for your 16:30
              class?
            </p>
            <button className="mt-3 inline-flex items-center gap-1 rounded-lg bg-lilac-foreground/15 px-3 py-1.5 text-xs font-semibold backdrop-blur transition-colors hover:bg-lilac-foreground/25">
              Draft the plan <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}