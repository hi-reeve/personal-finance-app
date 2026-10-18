import { describe, expect, it } from "vite-plus/test";
import { accents, colorPresets, contrastRatio, themeCss, themes, type ThemeName } from "./index";

const AA_TEXT = 4.5;
const themeNames: ThemeName[] = ["light", "dark"];

describe("contrastRatio", () => {
  it("matches the WCAG reference values", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 1);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
  });
});

describe.each(themeNames)("%s theme meets WCAG 2.2 AA", (theme) => {
  const base = themes[theme];

  it.each(["canvas", "surface"] as const)("body and muted text read on the %s", (ground) => {
    expect(contrastRatio(base.ink, base[ground])).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrastRatio(base.inkMuted, base[ground])).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it.each(["canvas", "surface"] as const)(
    "form control borders are visible against the %s (3:1)",
    (ground) => {
      expect(contrastRatio(base.control, base[ground])).toBeGreaterThanOrEqual(3);
    },
  );

  it.each(Object.keys(accents))(
    "the %s accent works as a fill with its foreground and as text",
    (name) => {
      const accent = accents[name as keyof typeof accents][theme];
      expect(contrastRatio(accent.fill, accent.onFill)).toBeGreaterThanOrEqual(AA_TEXT);
      expect(contrastRatio(accent.fill, base.canvas)).toBeGreaterThanOrEqual(AA_TEXT);
      expect(contrastRatio(accent.fill, base.surface)).toBeGreaterThanOrEqual(AA_TEXT);
    },
  );

  it.each(Object.keys(colorPresets))(
    "the %s colour preset reads as text on the canvas and surface",
    (name) => {
      const preset = colorPresets[name as keyof typeof colorPresets][theme];
      for (const role of ["income", "expense", "success", "warning", "info"] as const) {
        expect(
          contrastRatio(preset[role], base.canvas),
          `${name} ${role} on canvas`,
        ).toBeGreaterThanOrEqual(AA_TEXT);
        expect(
          contrastRatio(preset[role], base.surface),
          `${name} ${role} on surface`,
        ).toBeGreaterThanOrEqual(AA_TEXT);
      }
      expect(
        contrastRatio(preset.danger, preset.onDanger),
        `${name} danger badge`,
      ).toBeGreaterThanOrEqual(AA_TEXT);
    },
  );
});

describe("themeCss", () => {
  const css = themeCss();

  it("defaults to the light theme, terracotta accent and classic colours", () => {
    expect(css).toMatch(/:root\s*\{[^}]*--canvas:\s*#f3ebdd;/);
    expect(css).toMatch(/:root\s*\{[^}]*--accent:\s*#a84d31;/);
    expect(css).toMatch(/:root\s*\{[^}]*--income:\s*#296f37;/);
  });

  it("switches to dark for an explicit choice", () => {
    expect(css).toMatch(/:root\[data-theme="dark"\]\s*\{[^}]*--canvas:\s*#1f1814;/);
  });

  it("follows the system preference unless light is chosen explicitly", () => {
    expect(css).toMatch(
      /@media \(prefers-color-scheme: dark\)\s*\{\s*:root:not\(\[data-theme="light"\]\)\s*\{[^}]*--canvas:\s*#1f1814;/,
    );
  });

  it("offers every accent and the colour-blind preset, in both light and dark", () => {
    for (const name of Object.keys(accents)) {
      expect(css).toContain(`[data-accent="${name}"]`);
    }
    expect(css).toMatch(/\[data-colors="colorblind"\]\s*\{[^}]*--expense:\s*#a64f00;/);
    expect(css).toMatch(
      /\[data-theme="dark"\]\[data-colors="colorblind"\]\s*\{[^}]*--expense:\s*#f5a65b;/,
    );
    expect(css).toMatch(
      /\[data-theme="dark"\]\[data-accent="teal"\]\s*\{[^}]*--accent:\s*#5fc2bb;/,
    );
  });
});
