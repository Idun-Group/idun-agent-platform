import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#f7f6f0",
        surface: "#ffffff",
        ink: "#1d1c1a",
        muted: "#6b6a65",
        rule: "#e7e4d7",
        accent: "#c96442",
      },
      fontFamily: {
        sans: ["'Geist'", "system-ui", "sans-serif"],
        serif: ["'Fraunces'", "Georgia", "serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "Consolas", "monospace"],
      },
      boxShadow: {
        soft: "0 1px 2px rgba(20,20,20,0.04), 0 4px 12px rgba(20,20,20,0.04)",
        lift: "0 2px 4px rgba(20,20,20,0.05), 0 12px 40px rgba(20,20,20,0.06)",
      },
    },
  },
  plugins: [],
} satisfies Config;
