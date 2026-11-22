// Shared responsive helpers used across pages.
export const BREAKPOINTS = {
  mobile: 576,
  tablet: 768,
  laptop: 992,
  large: 1200,
  xxl: 1366,
} as const;

export const MOBILE_CSS = `
  .stats-grid { display: grid; gap: 1.25rem; grid-template-columns: 1fr; }
  @media (min-width: 768px) { .stats-grid { grid-template-columns: repeat(2, 1fr); } }
  @media (min-width: 1366px) { .stats-grid { grid-template-columns: repeat(4, 1fr); } }
`;

export const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
