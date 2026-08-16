import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: { center: true, padding: "1rem", screens: { "2xl": "1400px" } },
    // Override radius scale — every token caps at 4px so misuse rounds harmlessly.
    borderRadius: {
      none: "0",
      sm: "2px",
      DEFAULT: "2px",
      md: "3px",
      lg: "4px",
      xl: "4px",
      "2xl": "4px",
      "3xl": "4px",
      full: "4px",
    },
    extend: {
      fontFamily: {
        sans: ["'Inter'", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
        mono: ["'JetBrains Mono'", "'IBM Plex Mono'", "'SF Mono'", "Menlo", "ui-monospace", "monospace"],
      },
      fontSize: {
        xs: ["12px", { lineHeight: "1" }],
        sm: ["12px", { lineHeight: "1" }],
        base: ["12px", { lineHeight: "1.4" }],
        md: ["12px", { lineHeight: "1" }],
        lg: ["14px", { lineHeight: "1.2" }],
        xl: ["16px", { lineHeight: "1.2" }],
        "2xl": ["20px", { lineHeight: "1.2" }],
      },
      colors: {
        // Primary design system tokens — simplified & modern
        bg: {
          base: "hsl(var(--bg-base))",
          panel: "hsl(var(--bg-panel))",
          card: "hsl(var(--bg-card))",
          hover: "hsl(var(--bg-hover) / 0.04)",
          active: "hsl(var(--bg-active) / 0.07)",
        },
        text: {
          body: "hsl(var(--text-body))",
          muted: "hsl(var(--text-muted))",
          tertiary: "hsl(var(--text-tertiary))",
          disabled: "hsl(var(--text-disabled))",
        },
        border: {
          subtle: "hsl(var(--border-subtle) / 0.06)",
          default: "hsl(var(--border-default) / 0.10)",
          strong: "hsl(var(--border-strong) / 0.16)",
        },
        mag: "hsl(var(--mag))",
        signal: {
          live: "hsl(var(--signal-live))",
          good: "hsl(var(--signal-good))",
          warn: "hsl(var(--signal-warn))",
        },

        // Legacy aliases (for backwards compatibility)
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          glow: "hsl(var(--primary-glow))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        surface: {
          0: "hsl(var(--bg-base))",
          1: "hsl(var(--bg-panel))",
          2: "hsl(var(--bg-card))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      // Drop shadcn's elevated shadows — depth is hairline borders.
      boxShadow: {
        none: "none",
        sm: "none",
        DEFAULT: "none",
        md: "none",
        lg: "none",
        xl: "none",
        "2xl": "none",
        modal: "0 24px 80px rgba(0,0,0,0.6)",
        panel: "none",
      },
      keyframes: {
        "accordion-down": { from: { height: "0" }, to: { height: "var(--radix-accordion-content-height)" } },
        "accordion-up":   { from: { height: "var(--radix-accordion-content-height)" }, to: { height: "0" } },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up":   "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
