import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  createTimelineTheme,
  getThemeTokens,
  type TimelineTheme,
  type TimelineThemeDefinition,
  type TimelineThemePreset,
  timelineThemes,
} from "../domain/theme";

const storageKey = "timeweaver.current-theme.v1";

export type StoredTheme = {
  preset: TimelineThemePreset;
  tokens: TimelineThemeDefinition;
  custom: boolean;
};

type ThemeContextValue = {
  theme: TimelineTheme;
  preset: TimelineThemePreset;
  custom: boolean;
  previewTheme: (theme: StoredTheme) => void;
  commitPreview: () => void;
  discardPreview: () => void;
  importTheme: (tokens: TimelineThemeDefinition) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [storedTheme, setStoredTheme] = useState<StoredTheme>(loadStoredTheme);
  const [preview, setPreview] = useState<StoredTheme | null>(null);
  const active = preview ?? storedTheme;

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(storedTheme));
    } catch {
      // Local storage is an optional convenience; exporting still preserves themes.
    }
  }, [storedTheme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme: createTimelineTheme(active.tokens, active.preset),
      preset: active.preset,
      custom: active.custom,
      previewTheme: setPreview,
      commitPreview: () => {
        if (preview) {
          setStoredTheme(preview);
          setPreview(null);
        }
      },
      discardPreview: () => setPreview(null),
      importTheme: (tokens) => {
        setPreview(null);
        setStoredTheme({ preset: "light", tokens, custom: true });
      },
    }),
    [active, preview],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error("useTheme must be used within ThemeProvider.");
  }
  return value;
}

function loadStoredTheme(): StoredTheme {
  const fallback: StoredTheme = {
    preset: "light",
    tokens: getThemeTokens(timelineThemes.light),
    custom: false,
  };
  try {
    const saved = localStorage.getItem(storageKey);
    if (!saved) {
      return fallback;
    }
    const parsed = JSON.parse(saved) as Partial<StoredTheme>;
    if (
      (parsed.preset !== "light" && parsed.preset !== "dark") ||
      typeof parsed.custom !== "boolean" ||
      !parsed.tokens
    ) {
      return fallback;
    }
    return parsed as StoredTheme;
  } catch {
    return fallback;
  }
}
