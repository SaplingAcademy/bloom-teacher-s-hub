import { Check, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useLanguage } from "@/hooks/use-language";

/**
 * Reusable Premium gate UI (Stage 1: Growth cards; stages 2/3 reuse it for
 * Library, Courses, Marketplace and Community rewards). Renders only neutral
 * placeholder shapes behind the blur — never real or invented values — so
 * locked users see an elegant preview without any sensitive data being loaded.
 */

const copy = {
  en: {
    badge: "Premium",
    cta: "Unlock your potential with Bloom Premium",
    button: "Discover Premium",
    dialogTitle: "Bloom Premium",
    dialogSubtitle: "Everything you need to grow your teaching business.",
    benefits: [
      "Unlimited students",
      "Full revenue potential and growth opportunities",
      "Complete materials library",
      "Professional development courses",
      "Marketplace access",
      "Community points, rankings and rewards",
    ],
    note: "No payment in this step — direct subscription inside the app is coming soon.",
  },
  pt: {
    badge: "Premium",
    cta: "Desbloqueie seu potencial com o Bloom Premium",
    button: "Conhecer o Premium",
    dialogTitle: "Bloom Premium",
    dialogSubtitle: "Tudo o que você precisa para fazer seu negócio de aulas crescer.",
    benefits: [
      "Alunos ilimitados",
      "Potencial de receita e oportunidades de crescimento completos",
      "Biblioteca completa de materiais",
      "Cursos de desenvolvimento profissional",
      "Acesso ao Mercado",
      "Pontuação, rankings e prêmios da Comunidade",
    ],
    note: "Sem cobrança nesta etapa — em breve você poderá assinar direto pelo app.",
  },
} as const;

function useCopy() {
  const { lang } = useLanguage();
  return copy[lang === "pt" ? "pt" : "en"];
}

/**
 * Locked content area for a Premium card: blurred neutral placeholder, lock,
 * Premium badge, discreet CTA and a button that opens the benefits dialog.
 * `tone="dark"` adapts the placeholder/text to dark cards (e.g. the revenue
 * potential card).
 */
export function PremiumCardLock({
  onLearnMore,
  tone = "light",
}: {
  onLearnMore: () => void;
  tone?: "light" | "dark";
}) {
  const c = useCopy();
  const barClass = tone === "dark" ? "bg-sidebar-accent-foreground/15" : "bg-secondary";
  const textClass = tone === "dark" ? "text-sidebar-foreground" : "text-muted-foreground";

  return (
    <div className="relative mt-6 min-h-[240px] flex-1 overflow-hidden rounded-xl">
      {/* Neutral placeholder shapes — never real or invented values. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 select-none space-y-4 blur-[6px]"
      >
        <div className={`h-4 w-2/3 rounded ${barClass}`} />
        <div className={`h-4 w-1/2 rounded ${barClass}`} />
        <div className={`h-4 w-3/5 rounded ${barClass}`} />
        <div className={`h-9 w-4/5 rounded ${barClass}`} />
        <div className={`h-4 w-1/2 rounded ${barClass}`} />
        <div className={`h-4 w-2/5 rounded ${barClass}`} />
      </div>

      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-soft text-primary">
          <Lock className="h-5 w-5" />
        </div>
        <Badge className="bg-primary text-primary-foreground hover:bg-primary">{c.badge}</Badge>
        <p className={`max-w-xs text-xs font-semibold leading-relaxed ${textClass}`}>{c.cta}</p>
        <Button
          size="sm"
          onClick={onLearnMore}
          className="rounded-xl bg-primary text-xs font-bold text-primary-foreground shadow-sm hover:bg-primary/95"
        >
          {c.button}
        </Button>
      </div>
    </div>
  );
}

/**
 * Simple Premium benefits presentation — no checkout or billing in this stage.
 */
export function PremiumBenefitsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const c = useCopy();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-bold">{c.dialogTitle}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{c.dialogSubtitle}</p>
        <ul className="mt-3 space-y-2.5">
          {c.benefits.map((benefit) => (
            <li key={benefit} className="flex items-start gap-2.5 text-sm text-foreground">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>{benefit}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">{c.note}</p>
      </DialogContent>
    </Dialog>
  );
}
