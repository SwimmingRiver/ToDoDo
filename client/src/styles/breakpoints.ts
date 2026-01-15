export const breakpoints = {
  mobile: 480,
  tablet: 768,
  desktop: 1024,
} as const;

export const media = {
  mobile: `@media (max-width: ${breakpoints.mobile}px)`,
  tablet: `@media (max-width: ${breakpoints.tablet}px)`,
  desktop: `@media (max-width: ${breakpoints.desktop}px)`,
} as const;
