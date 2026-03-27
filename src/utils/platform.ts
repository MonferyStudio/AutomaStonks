/** Detect if the current device uses touch as primary input (phones + tablets) */
let _isMobile: boolean | null = null;

export function isMobile(): boolean {
  if (_isMobile !== null) return _isMobile;

  // Best signal: is the primary pointer coarse (finger) with no hover?
  const coarsePointer = window.matchMedia?.('(pointer: coarse)')?.matches ?? false;
  const noHover = window.matchMedia?.('(hover: none)')?.matches ?? false;

  if (coarsePointer && noHover) {
    _isMobile = true;
    return _isMobile;
  }

  // Fallback: UA sniffing for older browsers / edge cases
  const ua = navigator.userAgent || '';
  _isMobile = /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(ua)
    || ('ontouchstart' in window && navigator.maxTouchPoints > 1);

  return _isMobile;
}

/** Detect if the screen is "small" (portrait phone or small tablet) */
export function isSmallScreen(): boolean {
  return Math.min(window.innerWidth, window.innerHeight) < 600;
}

/** Text resolution capped for mobile performance */
export function textResolution(): number {
  return isMobile() ? 2 : 4;
}
