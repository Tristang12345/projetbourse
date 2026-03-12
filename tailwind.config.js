/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        terminal: {
          bg:       "#0a0c0f",
          surface:  "#0f1318",
          elevated: "#151b23",
          border:   "#1e2530",
          muted:    "#2a3340",
          text:     "#c8d4e0",
          dim:      "#6b7d8f",
          accent:   "#1a9fff",
        },
        up:   "#00e676",
        down: "#ff1744",
        warn: "#ffd600",
        vix:  "#ff6d00",
      },
      fontFamily: {
        mono: ["'JetBrains Mono'", "'Fira Code'", "monospace"],
        sans: ["'IBM Plex Sans'", "system-ui", "sans-serif"],
      },
      fontSize: {
        "2xs": ["0.625rem", { lineHeight: "0.875rem" }],
      },
      animation: {
        "pulse-green": "pulseGreen 1.5s ease-in-out infinite",
        "fade-in":     "fadeIn 0.2s ease-out",
        "slide-up":    "slideUp 0.3s ease-out",
        ticker:        "ticker 30s linear infinite",
      },
      keyframes: {
        pulseGreen: {
          "0%, 100%": { opacity: "1" },
          "50%":      { opacity: "0.4" },
        },
        fadeIn: {
          from: { opacity: "0" },
          to:   { opacity: "1" },
        },
        slideUp: {
          from: { transform: "translateY(8px)", opacity: "0" },
          to:   { transform: "translateY(0)",   opacity: "1" },
        },
        ticker: {
          from: { transform: "translateX(0)" },
          to:   { transform: "translateX(-50%)" },
        },
      },
      boxShadow: {
        glow:   "0 0 12px rgba(0,230,118,0.2)",
        "glow-red": "0 0 12px rgba(255,23,68,0.2)",
        panel:  "0 2px 16px rgba(0,0,0,0.5)",
      },
    },
  },
  plugins: [],
};
