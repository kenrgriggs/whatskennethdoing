import type { CSSProperties } from "react";

type CategoryColor = {
  hue: number;
  saturation: number;
  lightness: number;
};

// Stable palette for common categories; unknown categories get deterministic colors.
const KNOWN_CATEGORY_COLORS: Record<string, CategoryColor> = {
  TICKET: { hue: 38, saturation: 92, lightness: 58 },
  PROJECT: { hue: 220, saturation: 92, lightness: 58 },
  MEETING: { hue: 156, saturation: 78, lightness: 48 },
  ADMIN: { hue: 220, saturation: 8, lightness: 64 },
  GENERAL: { hue: 206, saturation: 35, lightness: 58 },
};

export type CategoryStyle = {
  badgeStyle: CSSProperties;
  rowStyle: CSSProperties;
  dotStyle: CSSProperties;
};

// Small deterministic hash to keep generated colors consistent between sessions.
function hashString(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function getCategoryColor(category: string): CategoryColor {
  const normalized = normalizeCategory(category).toUpperCase();
  const known = KNOWN_CATEGORY_COLORS[normalized];
  if (known) return known;

  const hash = hashString(normalized);
  return {
    hue: hash % 360,
    saturation: 80,
    lightness: 56,
  };
}

export function normalizeCategory(category: string | null | undefined) {
  const trimmed = category?.trim() ?? "";
  return trimmed || "General";
}

export function getCategoryLabel(category: string | null | undefined) {
  return normalizeCategory(category);
}

// Returns badge, row, and dot styles so all cards render category colors consistently.
export function getCategoryStyle(category: string | null | undefined): CategoryStyle {
  const { hue, saturation, lightness } = getCategoryColor(normalizeCategory(category));

  return {
    badgeStyle: {
      borderColor: `hsl(${hue} ${saturation}% ${lightness}% / 0.62)`,
      backgroundColor: `hsl(${hue} ${saturation}% ${lightness}% / 0.2)`,
    },
    rowStyle: {
      borderColor: `hsl(${hue} ${saturation}% ${lightness}% / 0.45)`,
      backgroundColor: `hsl(${hue} ${saturation}% ${lightness}% / 0.1)`,
    },
    dotStyle: {
      backgroundColor: `hsl(${hue} ${Math.min(96, saturation + 10)}% ${Math.min(72, lightness + 6)}%)`,
    },
  };
}

