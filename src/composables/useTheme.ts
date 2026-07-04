import { ref } from "vue";

/**
 * Global light/dark theme control.
 *
 * Toggles the `.p-dark` class on <html>, which is the single switch the whole
 * app keys off of:
 *   - PrimeVue (darkModeSelector: ".p-dark") re-derives every --p-* variable
 *   - tokens.css semantic aliases follow automatically
 *   - the canvas background observes the class via MutationObserver
 *
 * Preference is persisted to localStorage; first visit falls back to the OS
 * setting (prefers-color-scheme).
 */

const STORAGE_KEY = "agentsboard-theme";
type ThemeMode = "light" | "dark";

const isDark = ref(false);

function apply(mode: ThemeMode): void {
  isDark.value = mode === "dark";
  document.documentElement.classList.toggle("p-dark", isDark.value);
}

/** Resolve the initial mode: saved preference → OS preference → light. */
function resolveInitial(): ThemeMode {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === "light" || saved === "dark") return saved;
  const prefersDark =
    window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  return prefersDark ? "dark" : "light";
}

/** Call once, as early as possible (main.ts), to avoid a flash of wrong theme. */
export function initTheme(): void {
  apply(resolveInitial());
}

export function useTheme() {
  function setTheme(mode: ThemeMode): void {
    apply(mode);
    localStorage.setItem(STORAGE_KEY, mode);
  }

  function toggleTheme(): void {
    setTheme(isDark.value ? "light" : "dark");
  }

  return { isDark, setTheme, toggleTheme };
}
