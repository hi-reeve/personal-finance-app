import { SegmentGroup } from "@ark-ui/react/segment-group";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

const STORAGE_KEY = "pfa.appearance";

export const THEME_CHOICES = ["system", "light", "dark"] as const;
export const ACCENT_CHOICES = ["terracotta", "brown", "teal", "slate", "sage", "plum"] as const;
export const COLOR_CHOICES = ["classic", "colorblind"] as const;

export interface Appearance {
  theme: (typeof THEME_CHOICES)[number];
  accent: (typeof ACCENT_CHOICES)[number];
  colors: (typeof COLOR_CHOICES)[number];
}

const DEFAULTS: Appearance = { theme: "system", accent: "terracotta", colors: "classic" };

const pick = <T extends string>(choices: readonly T[], value: unknown, fallback: T): T =>
  choices.includes(value as T) ? (value as T) : fallback;

function readStored(): Appearance {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    const stored = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
    return {
      theme: pick(THEME_CHOICES, stored["theme"], DEFAULTS.theme),
      accent: pick(ACCENT_CHOICES, stored["accent"], DEFAULTS.accent),
      colors: pick(COLOR_CHOICES, stored["colors"], DEFAULTS.colors),
    };
  } catch {
    return DEFAULTS;
  }
}

/** Reflect the choice on `<html>` so the generated theme CSS applies. The defaults set no attribute. */
function apply(appearance: Appearance) {
  const root = document.documentElement;
  const set = (name: string, value: string | undefined) =>
    value === undefined ? root.removeAttribute(name) : root.setAttribute(name, value);
  set("data-theme", appearance.theme === "system" ? undefined : appearance.theme);
  set("data-accent", appearance.accent === DEFAULTS.accent ? undefined : appearance.accent);
  set("data-colors", appearance.colors === DEFAULTS.colors ? undefined : appearance.colors);
}

interface AppearanceState {
  appearance: Appearance;
  setAppearance: (patch: Partial<Appearance>) => void;
}

const AppearanceContext = createContext<AppearanceState>({
  appearance: DEFAULTS,
  setAppearance: () => {},
});

/** Device-local theme, accent and colour preset. Whether these sync is decided with the Settings ticket. */
export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [appearance, setCurrent] = useState<Appearance>(readStored);

  useEffect(() => {
    apply(appearance);
  }, [appearance]);

  const value = useMemo<AppearanceState>(
    () => ({
      appearance,
      setAppearance(patch) {
        setCurrent((current) => {
          const next = { ...current, ...patch };
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
          } catch {
            // Storage can be blocked; the choice then lasts only for this session.
          }
          return next;
        });
      },
    }),
    [appearance],
  );
  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

export function useAppearance(): AppearanceState {
  return useContext(AppearanceContext);
}

const THEME_LABEL: Record<Appearance["theme"], string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};
const ACCENT_LABEL: Record<Appearance["accent"], string> = {
  terracotta: "Terracotta",
  brown: "Brown",
  teal: "Teal",
  slate: "Slate blue",
  sage: "Sage",
  plum: "Plum",
};
const COLOR_LABEL: Record<Appearance["colors"], string> = {
  classic: "Classic",
  colorblind: "Colour-blind safe",
};

function Choice<T extends string>({
  label,
  options,
  labels,
  value,
  onChange,
}: {
  label: string;
  options: readonly T[];
  labels: Record<T, string>;
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <SegmentGroup.Root
      value={value}
      onValueChange={(details) => details.value && onChange(details.value as T)}
      className="flex flex-wrap gap-2"
      aria-label={label}
    >
      {options.map((option) => (
        <SegmentGroup.Item
          key={option}
          value={option}
          className="flex min-h-11 cursor-pointer items-center rounded-lg border border-line bg-surface px-3 text-ink data-[state=checked]:border-accent data-[state=checked]:bg-accent data-[state=checked]:text-on-accent"
        >
          <SegmentGroup.ItemText>{labels[option]}</SegmentGroup.ItemText>
          <SegmentGroup.ItemHiddenInput />
        </SegmentGroup.Item>
      ))}
    </SegmentGroup.Root>
  );
}

export function AppearanceControls() {
  const { appearance, setAppearance } = useAppearance();
  return (
    <div className="flex flex-col gap-4">
      <Choice
        label="Theme"
        options={THEME_CHOICES}
        labels={THEME_LABEL}
        value={appearance.theme}
        onChange={(theme) => setAppearance({ theme })}
      />
      <Choice
        label="Accent colour"
        options={ACCENT_CHOICES}
        labels={ACCENT_LABEL}
        value={appearance.accent}
        onChange={(accent) => setAppearance({ accent })}
      />
      <Choice
        label="Income and expense colours"
        options={COLOR_CHOICES}
        labels={COLOR_LABEL}
        value={appearance.colors}
        onChange={(colors) => setAppearance({ colors })}
      />
    </div>
  );
}

/**
 * Runs before first paint so the saved theme shows without a flash. Mirrors `apply` above:
 * reads the same storage key and sets the same attributes.
 */
export const APPEARANCE_INIT_SCRIPT = `try{var a=JSON.parse(localStorage.getItem("${STORAGE_KEY}")||"null");if(a){var r=document.documentElement;if(a.theme==="light"||a.theme==="dark")r.setAttribute("data-theme",a.theme);if(a.accent&&a.accent!=="${DEFAULTS.accent}")r.setAttribute("data-accent",a.accent);if(a.colors&&a.colors!=="${DEFAULTS.colors}")r.setAttribute("data-colors",a.colors)}}catch(e){}`;
