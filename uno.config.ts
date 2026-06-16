import {
  defineConfig,
  presetWind3,
  presetAttributify,
  presetIcons,
} from "unocss";

export default defineConfig({
  presets: [presetWind3(), presetAttributify(), presetIcons()],
  theme: {
    colors: {
      primary: "var(--p-primary-color)",
      primaryHover: "var(--p-primary-hover-color)",
      primaryActive: "var(--p-primary-active-color)",
      pTextColor: "var(--p-text-color)",
      pTextMutedColor: "var(--p-text-muted-color)",
      surface: {
        0: "var(--p-surface-0)",
        50: "var(--p-surface-50)",
        100: "var(--p-surface-100)",
        200: "var(--p-surface-200)",
        300: "var(--p-surface-300)",
        400: "var(--p-surface-400)",
        500: "var(--p-surface-500)",
        600: "var(--p-surface-600)",
        700: "var(--p-surface-700)",
        800: "var(--p-surface-800)",
        900: "var(--p-surface-900)",
        950: "var(--p-surface-950)",
      },
    },
  },
});
