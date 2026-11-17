import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

/** Height of the bottom fade; it starts this far above the edge and ends fully transparent. */
const FADE_PX = 56;
/** Progressive (eased) mask: content fades gently, without an opaque band. */
const FADE_MASK = `linear-gradient(to bottom, #000 calc(100% - ${FADE_PX}px), rgba(0,0,0,0.75) calc(100% - ${FADE_PX * 0.6}px), rgba(0,0,0,0.35) calc(100% - ${FADE_PX * 0.25}px), transparent 100%)`;
const FADE_STYLE: CSSProperties = { maskImage: FADE_MASK, WebkitMaskImage: FADE_MASK };

/**
 * Presentation only: a soft bottom fade on a scrollable list while more content sits below. It is a
 * mask (the card background shows through), so nothing is covered and every control stays clickable;
 * at the end of the list (or when nothing overflows) the fade disappears and the last item is fully
 * legible. `contentKey` re-checks after the content changes (filters, loading).
 */
export function useScrollFade<T extends HTMLElement>(contentKey?: unknown) {
  const ref = useRef<T>(null);
  const [fade, setFade] = useState(false);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setFade(el.scrollHeight - el.scrollTop - el.clientHeight > 2);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();
    el.addEventListener("scroll", update, { passive: true });
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    if (observer) {
      observer.observe(el);
      Array.from(el.children).forEach((child) => observer.observe(child));
    }
    return () => {
      el.removeEventListener("scroll", update);
      observer?.disconnect();
    };
  }, [update, contentKey]);

  return { ref, fade, style: fade ? FADE_STYLE : undefined };
}
