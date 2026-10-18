import {
  accentNames,
  accents,
  colorPresetNames,
  colorPresets,
  themes,
  type AccentColor,
  type BaseTheme,
  type SemanticColors,
  type ThemeName,
} from "./palette";

const DEFAULT_ACCENT = "terracotta";
const DEFAULT_COLORS = "classic";

const base = (t: BaseTheme, scheme: ThemeName) =>
  `color-scheme: ${scheme}; --canvas: ${t.canvas}; --surface: ${t.surface}; --line: ${t.line}; --control: ${t.control}; --ink: ${t.ink}; --ink-muted: ${t.inkMuted};`;
const accent = (a: AccentColor) => `--accent: ${a.fill}; --on-accent: ${a.onFill};`;
const semantic = (s: SemanticColors) =>
  `--income: ${s.income}; --expense: ${s.expense}; --success: ${s.success}; --warning: ${s.warning}; --info: ${s.info}; --danger: ${s.danger}; --on-danger: ${s.onDanger};`;

/** Rules that set one theme's values, keyed by the selector prefix that scopes them to that theme. */
function rulesFor(theme: ThemeName, scope: string): string[] {
  const rules = [
    `${scope} { ${base(themes[theme], theme)} ${accent(accents[DEFAULT_ACCENT][theme])} ${semantic(colorPresets[DEFAULT_COLORS][theme])} }`,
  ];
  for (const name of accentNames) {
    if (name === DEFAULT_ACCENT && theme === "light") continue;
    rules.push(`${scope}[data-accent="${name}"] { ${accent(accents[name][theme])} }`);
  }
  for (const name of colorPresetNames) {
    if (name === DEFAULT_COLORS && theme === "light") continue;
    rules.push(`${scope}[data-colors="${name}"] { ${semantic(colorPresets[name][theme])} }`);
  }
  return rules;
}

/**
 * The whole theme as CSS custom properties. The page picks values with attributes on `<html>`:
 * `data-theme="light|dark"` (absent means follow the system), `data-accent` and `data-colors`.
 */
export function themeCss(): string {
  const light = rulesFor("light", ":root");
  const darkExplicit = rulesFor("dark", ':root[data-theme="dark"]');
  const darkSystem = rulesFor("dark", ':root:not([data-theme="light"])');
  return [
    ...light,
    ...darkExplicit,
    `@media (prefers-color-scheme: dark) {\n${darkSystem.map((rule) => `  ${rule}`).join("\n")}\n}`,
  ].join("\n");
}
