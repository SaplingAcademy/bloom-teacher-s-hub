import type { ReactNode } from "react";
import type { CommunityTopic } from "@/lib/community-topics";
import { cn } from "@/lib/utils";

/**
 * Abstract, decorative covers for the Community subject blocks: organic shapes (petals, circles,
 * curves) drawn with plain SVG in the Bloom tokens. No images; hidden from assistive technology and
 * never a target for clicks.
 */
const VIEW = "0 0 320 112";

/** A petal (leaf-like shape) pointing up from (0,0), later placed with a transform. */
const Petal = ({ className, transform }: { className: string; transform: string }) => (
  <path d="M0 0 C 14 -16 14 -40 0 -56 C -14 -40 -14 -16 0 0 Z" className={className} transform={transform} />
);

const COVERS: Record<CommunityTopic, { background: string; art: ReactNode }> = {
  // Dúvidas: an open flower of petals, a few loose dots (questions in the air).
  questions: {
    background: "bg-primary-soft",
    art: (
      <>
        <path d="M0 86 C 70 60 130 108 200 84 S 300 60 320 72 V112 H0 Z" className="fill-primary/10" />
        {[-50, -20, 10, 40].map((angle) => <Petal key={angle} className="fill-primary/25" transform={`translate(236 92) rotate(${angle})`} />)}
        <circle cx="236" cy="92" r="9" className="fill-accent/70" />
        <circle cx="70" cy="34" r="6" className="fill-primary/30" />
        <circle cx="94" cy="22" r="3.5" className="fill-primary/20" />
        <circle cx="112" cy="40" r="2.5" className="fill-lilac/50" />
      </>
    ),
  },
  // Ideias de aulas: overlapping circles, like sparks of ideas meeting.
  lesson_ideas: {
    background: "bg-accent-soft",
    art: (
      <>
        <circle cx="238" cy="58" r="38" className="fill-accent/25" />
        <circle cx="198" cy="76" r="26" className="fill-primary/15" />
        <circle cx="268" cy="30" r="14" className="fill-lilac/40" />
        <path d="M24 92 C 64 52 104 52 144 92" className="fill-none stroke-accent/50" strokeWidth="3" strokeLinecap="round" />
        <circle cx="52" cy="28" r="5" className="fill-accent/60" />
      </>
    ),
  },
  // Materiais: stacked soft leaves, an orderly, calm rhythm.
  materials: {
    background: "bg-note-mint",
    art: (
      <>
        {[0, 1, 2].map((i) => <Petal key={i} className={i === 1 ? "fill-primary/30" : "fill-primary/18"} transform={`translate(${196 + i * 34} 104) rotate(${-18 + i * 18})`} />)}
        <rect x="34" y="30" width="58" height="10" rx="5" className="fill-primary/15" />
        <rect x="34" y="48" width="38" height="10" rx="5" className="fill-primary/10" />
        <circle cx="292" cy="24" r="8" className="fill-accent/50" />
      </>
    ),
  },
  // Gestão: gentle concentric curves, a steady and organized flow.
  management: {
    background: "bg-lilac-soft",
    art: (
      <>
        {[0, 1, 2].map((i) => (
          <path key={i} d={`M${150 + i * 22} 112 A ${70 - i * 18} ${70 - i * 18} 0 0 1 ${290 - i * 22} 112`} className="fill-none stroke-lilac-strong/30" strokeWidth="3" />
        ))}
        <circle cx="220" cy="96" r="10" className="fill-primary/30" />
        <path d="M18 40 C 48 20 78 60 108 40" className="fill-none stroke-primary/25" strokeWidth="3" strokeLinecap="round" />
      </>
    ),
  },
  // Conquistas: a blooming flower with a warm center, the most festive composition.
  achievements: {
    background: "bg-note-peach",
    art: (
      <>
        {[0, 60, 120, 180, 240, 300].map((angle) => <Petal key={angle} className="fill-accent/30" transform={`translate(240 58) rotate(${angle})`} />)}
        <circle cx="240" cy="58" r="12" className="fill-primary/40" />
        <circle cx="60" cy="80" r="16" className="fill-lilac/30" />
        <circle cx="88" cy="40" r="5" className="fill-accent/60" />
      </>
    ),
  },
};

export function TopicCover({ topic, className }: { topic: CommunityTopic; className?: string }) {
  const cover = COVERS[topic];
  return (
    <div aria-hidden="true" data-community-cover={topic} className={cn("pointer-events-none h-24 w-full overflow-hidden", cover.background, className)}>
      <svg viewBox={VIEW} preserveAspectRatio="xMidYMid slice" className="h-full w-full" focusable="false">{cover.art}</svg>
    </div>
  );
}

/** Side art for the featured "Ajude outro professor" block: hands-like petals around a center. */
export function HelpArt({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" focusable="false" data-community-help-art="" viewBox="0 0 200 120" preserveAspectRatio="xMaxYMid slice"
      className={cn("pointer-events-none h-full w-full", className)}>
      <circle cx="150" cy="60" r="52" className="fill-primary-foreground/10" />
      {[-60, -25, 25, 60].map((angle) => <Petal key={angle} className="fill-primary-foreground/25" transform={`translate(150 96) rotate(${angle})`} />)}
      <circle cx="150" cy="70" r="10" className="fill-accent" />
      <circle cx="58" cy="30" r="5" className="fill-primary-foreground/30" />
      <path d="M20 96 C 50 76 80 112 110 92" className="fill-none stroke-primary-foreground/25" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
