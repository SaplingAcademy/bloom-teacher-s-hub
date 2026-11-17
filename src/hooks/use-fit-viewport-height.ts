import { useEffect, useState, type RefObject } from "react";

/** Desktop breakpoint where the home blocks are fitted to the screen (Tailwind `xl`). */
const DESKTOP_QUERY = "(min-width: 1280px)";

/**
 * Height left for `ref` inside the app's scrolling area (the <main> below the real top bar): from the
 * element's top to the end of the visible area, minus the area's bottom padding. Returns null — normal
 * page scrolling — below the desktop breakpoint or when less than `min` px would be left, so short
 * screens never get clipped content. Recomputed on resize and when the content above changes size.
 */
export function useFitViewportHeight(ref: RefObject<HTMLElement | null>, min = 420): number | null {
  const [height, setHeight] = useState<number | null>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof window === "undefined") return;
    const area = element.closest("main") ?? document.scrollingElement ?? document.documentElement;
    const media = window.matchMedia?.(DESKTOP_QUERY);
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!media?.matches) { setHeight(null); return; }
        const areaRect = area.getBoundingClientRect();
        const top = element.getBoundingClientRect().top - areaRect.top + area.scrollTop;
        const paddingBottom = parseFloat(getComputedStyle(area).paddingBottom) || 0;
        const available = Math.floor(area.clientHeight - top - paddingBottom);
        setHeight(available >= min ? available : null);
      });
    };
    measure();
    window.addEventListener("resize", measure);
    media?.addEventListener?.("change", measure);
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    // Content above the blocks (e.g. the greeting) changing size moves their top.
    if (observer && area.firstElementChild) observer.observe(area.firstElementChild);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
      media?.removeEventListener?.("change", measure);
      observer?.disconnect();
    };
  }, [ref, min]);
  return height;
}
