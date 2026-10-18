export type ThemeName = "light" | "dark";

/** Warm beige canvas, cream cards, brown ink. Dark is a warm dark brown, never black. */
export interface BaseTheme {
  canvas: string;
  surface: string;
  line: string;
  ink: string;
  inkMuted: string;
}

export const themes: Record<ThemeName, BaseTheme> = {
  light: {
    canvas: "#f3ebdd",
    surface: "#fbf6ec",
    line: "#dccfba",
    ink: "#3b2a20",
    inkMuted: "#6b5848",
  },
  dark: {
    canvas: "#1f1814",
    surface: "#2a211b",
    line: "#3e322a",
    ink: "#f1e6d6",
    inkMuted: "#b9a692",
  },
};

export interface AccentColor {
  /** Used as a fill (buttons) and as link/text colour. */
  fill: string;
  /** Text and icons placed on the fill. */
  onFill: string;
}

export const accentNames = ["terracotta", "brown", "teal", "slate", "sage", "plum"] as const;
export type AccentName = (typeof accentNames)[number];

/** Terracotta is the default. Each accent has a lighter variant for dark mode. */
export const accents: Record<AccentName, Record<ThemeName, AccentColor>> = {
  terracotta: {
    light: { fill: "#a84d31", onFill: "#fff8ef" },
    dark: { fill: "#e39070", onFill: "#1f1814" },
  },
  brown: {
    light: { fill: "#7a5230", onFill: "#fff8ef" },
    dark: { fill: "#d1a77a", onFill: "#1f1814" },
  },
  teal: {
    light: { fill: "#1f6f6b", onFill: "#fff8ef" },
    dark: { fill: "#5fc2bb", onFill: "#1f1814" },
  },
  slate: {
    light: { fill: "#3f5f8f", onFill: "#fff8ef" },
    dark: { fill: "#8fb0e3", onFill: "#1f1814" },
  },
  sage: {
    light: { fill: "#4f6f45", onFill: "#fff8ef" },
    dark: { fill: "#9cc48f", onFill: "#1f1814" },
  },
  plum: {
    light: { fill: "#82466f", onFill: "#fff8ef" },
    dark: { fill: "#d79bc6", onFill: "#1f1814" },
  },
};

/** Direction and status colours. Danger is a filled badge, reserved for things that need action. */
export interface SemanticColors {
  income: string;
  expense: string;
  success: string;
  warning: string;
  info: string;
  danger: string;
  onDanger: string;
}

export const colorPresetNames = ["classic", "colorblind"] as const;
export type ColorPresetName = (typeof colorPresetNames)[number];

/** Expense is a cooler crimson so it stays distinct from the terracotta accent. */
export const colorPresets: Record<ColorPresetName, Record<ThemeName, SemanticColors>> = {
  classic: {
    light: {
      income: "#296f37",
      expense: "#b0233f",
      success: "#296f37",
      warning: "#8a5a00",
      info: "#1f5fa8",
      danger: "#a3201d",
      onDanger: "#ffffff",
    },
    dark: {
      income: "#6fcf86",
      expense: "#f08aa0",
      success: "#6fcf86",
      warning: "#e5b04a",
      info: "#7db3f0",
      danger: "#e8504a",
      onDanger: "#1f1814",
    },
  },
  colorblind: {
    light: {
      income: "#1f5fa8",
      expense: "#a64f00",
      success: "#1f5fa8",
      warning: "#8a5a00",
      info: "#1f5fa8",
      danger: "#a3201d",
      onDanger: "#ffffff",
    },
    dark: {
      income: "#7db3f0",
      expense: "#f5a65b",
      success: "#7db3f0",
      warning: "#e5b04a",
      info: "#7db3f0",
      danger: "#e8504a",
      onDanger: "#1f1814",
    },
  },
};
