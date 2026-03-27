/**
 * Responsive utilities for HTML-based UI panels.
 * Provides adaptive sizing that works on both desktop and mobile.
 */

/** Returns a CSS width value that adapts to viewport:
 *  - On wide screens: uses the preferred width
 *  - On narrow screens: fills most of the viewport
 */
export function responsiveWidth(preferredPx: number): string {
  return `min(${preferredPx}px, calc(100vw - 24px))`;
}

/** Shared panel base styles for consistent mobile-friendly popups */
export function panelBaseStyles(preferredWidth: number): Record<string, string> {
  return {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: responsiveWidth(preferredWidth),
    maxHeight: 'min(80vh, calc(100dvh - 48px))',
    overflowY: 'auto',
    zIndex: '950',
    fontFamily: 'Inter, sans-serif',
    fontSize: '12px',
    color: '#e8e8e8',
    background: '#16213e',
    border: '1px solid #2d3548',
    borderRadius: '10px',
    boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
  };
}

/** Side panel styles (anchored to left/right edge) */
export function sidePanelStyles(preferredWidth: number, side: 'left' | 'right' = 'right'): Record<string, string> {
  return {
    position: 'fixed',
    top: '50%',
    [side]: '12px',
    transform: 'translateY(-50%)',
    width: responsiveWidth(preferredWidth),
    maxHeight: 'min(80vh, calc(100dvh - 48px))',
    overflowY: 'auto',
    zIndex: '950',
    fontFamily: 'Inter, sans-serif',
    fontSize: '12px',
    color: '#e8e8e8',
    background: '#16213e',
    border: '1px solid #2d3548',
    borderRadius: '10px',
    boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
  };
}
