// @ts-ignore
import "@primeuix/styles"; // When styles change, the app will hot reload.

import { definePreset } from "@primeuix/themes";
import Aura from "@primeuix/themes/aura";

/**
 * OmniCanvas theme — the SINGLE source of truth for the app's color palette.
 *
 * Everything downstream reads from the PrimeVue `--p-*` CSS variables this
 * preset generates:
 *   - PrimeVue components (buttons, dialogs, inputs …)
 *   - UnoCSS color tokens (see uno.config.ts → surface / primary / pText*)
 *   - Semantic aliases in styles/tokens.css (--text-primary, --border-color …)
 *
 * To restyle the whole product, change the ramps here — nothing else.
 *
 * Palette direction (reference): a light, warm-neutral "creative tool" look —
 * soft light-gray app canvas, white floating panels, hairline borders and a
 * near-black CTA (no brand hue). Dark mode mirrors it.
 */

// ── Warm-neutral surface ramp (light) ───────────────────────────────────────
// 0 = white panels · 50 = app canvas · 100 = hover/selected · 200 = hairline
// border · 900 = primary text · 950 = near-black CTA.
const SURFACE_LIGHT = {
  0: "#ffffff",
  50: "#f5f6f7",
  100: "#f2f3f5",
  200: "#ececee",
  300: "#e0e1e4",
  400: "#c4c6ca",
  500: "#9a9ca1",
  600: "#86868b",
  700: "#5f6165",
  800: "#3a3b3e",
  900: "#1d1d1f",
  950: "#161618",
};

// ── Surface ramp (dark) — proper elevation, not a naive inversion ───────────
// This codebase uses surface-0 as the PANEL/paper bg and surface-50 as the app
// canvas. To read as "panels floating above the canvas" (as in light mode), the
// canvas (50) must be the DARKEST and panels (0) slightly elevated/lighter, with
// hover/border rising further. Higher indices climb toward light text.
const SURFACE_DARK = {
  0: "#18181b", // panel / card (elevated)
  50: "#121215", // app canvas (darkest — sits behind panels)
  100: "#27272a", // hover / selected
  200: "#3f3f46", // hairline border (visible on panels)
  300: "#52525b",
  400: "#71717a",
  500: "#8e8e93",
  600: "#a1a1aa", // muted text
  700: "#d4d4d8",
  800: "#e4e4e7",
  900: "#f4f4f6", // primary text
  950: "#ffffff",
};

export const NoirPreset = definePreset(Aura, {
  semantic: {
    // primary maps onto the surface ramp — a neutral, near-black accent
    // rather than a brand hue.
    primary: {
      50: "{surface.50}",
      100: "{surface.100}",
      200: "{surface.200}",
      300: "{surface.300}",
      400: "{surface.400}",
      500: "{surface.500}",
      600: "{surface.600}",
      700: "{surface.700}",
      800: "{surface.800}",
      900: "{surface.900}",
      950: "{surface.950}",
    },
    colorScheme: {
      light: {
        surface: SURFACE_LIGHT,
        primary: {
          color: "{surface.950}", // near-black CTA (#161618)
          contrastColor: "#ffffff",
          hoverColor: "{surface.800}",
          activeColor: "{surface.700}",
        },
        text: {
          color: "{surface.900}", // #1d1d1f primary text
          hoverColor: "{surface.950}",
          mutedColor: "{surface.600}", // #86868b secondary text
          hoverMutedColor: "{surface.700}",
        },
        content: {
          background: "{surface.0}",
          borderColor: "{surface.200}", // #ececee hairline
        },
        highlight: {
          background: "{surface.100}",
          focusBackground: "{surface.200}",
          color: "{surface.900}",
          focusColor: "{surface.950}",
        },
      },
      dark: {
        surface: SURFACE_DARK,
        primary: {
          color: "{surface.900}",
          contrastColor: "{surface.0}",
          hoverColor: "{surface.800}",
          activeColor: "{surface.700}",
        },
        text: {
          color: "{surface.900}",
          hoverColor: "{surface.950}",
          mutedColor: "{surface.600}",
          hoverMutedColor: "{surface.700}",
        },
        content: {
          background: "{surface.0}",
          borderColor: "{surface.200}",
        },
        highlight: {
          background: "{surface.100}",
          focusBackground: "{surface.200}",
          color: "{surface.900}",
          focusColor: "{surface.950}",
        },
      },
    },
  },
  components: {
    dialog: {
      colorScheme: {
        light: {
          root: {
            background: "{surface.0}",
            color: "{surface.900}",
            borderColor: "{surface.200}",
          },
          header: {
            background: "{surface.0}",
            color: "{surface.900}",
          },
          content: {
            background: "{surface.0}",
            color: "{surface.900}",
          },
          footer: {
            background: "{surface.0}",
            color: "{surface.900}",
          },
        },
        dark: {
          root: {
            background: "{surface.0}",
            color: "{surface.900}",
            borderColor: "{surface.200}",
          },
          header: {
            background: "{surface.0}",
            color: "{surface.900}",
          },
          content: {
            background: "{surface.0}",
            color: "{surface.900}",
          },
          footer: {
            background: "{surface.0}",
            color: "{surface.900}",
          },
        },
      },
    },
    popover: {
      colorScheme: {
        light: {
          root: {
            background: "{surface.0}",
            color: "{surface.900}",
            borderColor: "{surface.200}",
          },
        },
        dark: {
          root: {
            background: "{surface.0}",
            color: "{surface.900}",
            borderColor: "{surface.200}",
          },
        },
      },
    },
    select: {
      colorScheme: {
        light: {
          overlay: {
            background: "{surface.0}",
            borderColor: "{surface.200}",
            color: "{surface.900}",
          },
          list: {
            padding: "4px",
            gap: "2px",
          },
          option: {
            focusBackground: "{surface.100}",
            selectedBackground: "{surface.200}",
            color: "{surface.900}",
            focusColor: "{surface.950}",
            selectedColor: "{surface.950}",
          },
        },
        dark: {
          overlay: {
            background: "{surface.0}",
            borderColor: "{surface.200}",
            color: "{surface.900}",
          },
          list: {
            padding: "4px",
            gap: "2px",
          },
          option: {
            focusBackground: "{surface.100}",
            selectedBackground: "{surface.200}",
            color: "{surface.900}",
            focusColor: "{surface.950}",
            selectedColor: "{surface.950}",
          },
        },
      },
    },
  },
});

export default {
  preset: NoirPreset,
  options: {
    darkModeSelector: ".p-dark",
  },
};
