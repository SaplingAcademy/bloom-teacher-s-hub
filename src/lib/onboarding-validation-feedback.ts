/** Presentation only: existing validators mark blocking errors; this never validates answers. */
export function focusFirstOnboardingError(
  container: HTMLElement | null,
  header: HTMLElement | null,
): boolean {
  if (!container) return false;

  const invalid = Array.from(container.querySelectorAll<HTMLElement>(
    '[aria-invalid="true"], [data-onboarding-invalid="true"]',
  )).find((element) => element.getClientRects().length > 0 &&
    !element.closest('[hidden], [aria-hidden="true"]'));
  if (!invalid) return false;

  const controlSelector = 'input:not(:disabled), select:not(:disabled), textarea:not(:disabled), button:not(:disabled), [tabindex]';
  const focusTarget = invalid.matches(controlSelector)
    ? invalid
    : invalid.querySelector<HTMLElement>(controlSelector) ?? invalid;
  if (focusTarget === invalid && !invalid.matches(controlSelector)) {
    invalid.tabIndex = -1;
  }
  focusTarget.focus({ preventScroll: true });

  // Measure the actual sticky header/progress, including wrapping on small screens.
  const headerBottom = Math.max(0, header?.getBoundingClientRect().bottom ?? 0);
  const top = Math.max(0, window.scrollY + invalid.getBoundingClientRect().top - headerBottom - 16);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({ top, behavior: reducedMotion ? 'instant' : 'smooth' });
  return true;
}