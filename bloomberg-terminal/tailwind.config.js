/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        terminal: {
          bg: "#060A0F",
          surface: "#0C1118",
          border: "#1A2332",
          hover: "#111927",
          accent: "#1E3A5F",
        },
        pos: {
          DEFAULT: "#00FF88",
          dim: "#00CC6A",
          muted: "rgba(0,255,136,0.15)",
        },
        neg: {
          DEFAULT: "#FF3355",
          dim: "#CC2244",
          muted: "rgba(255,51,85,0.15)",
        },
        brand: {
          amber: "#FFB800",
          blue: "#00AAFF",
          purple: "#9966FF",
          cyan: "#00E5FF",
        },
      },
      fontFamily: {
        mono: ["'JetBrains Mono'", "'Fira Code'", "monospace"],
        display: ["'IBM Plex Sans'", "sans-serif"],
        data: ["'DM Mono'", "monospace"],
      },
      fontSize: {
        "2xs": ["0.625rem", { lineHeight: "0.875rem" }],
      },
      animation: {
        "pulse-pos": "pulsePos 2s ease-in-out infinite",
        "pulse-neg": "pulseNeg 2s ease-in-out infinite",
        "slide-in": "slideIn 0.2s ease-out",
        "fade-in": "fadeIn 0.3s ease-out",
        "ticker-scroll": "tickerScroll 30s linear infinite",
        blink: "blink 1s step-end infinite",
      },
      keyframes: {
        pulsePos: {
          "0%, 100%": { opacity: 1 },
          "50%": { opacity: 0.7, color: "#00FF88" },
        },
        pulseNeg: {
          "0%, 100%": { opacity: 1 },
          "50%": { opacity: 0.7, color: "#FF3355" },
        },
        slideIn: {
          from: { transform: "translateY(-4px)", opacity: 0 },
          to: { transform: "translateY(0)", opacity: 1 },
        },
        fadeIn: {
          from: { opacity: 0 },
          to: { opacity: 1 },
        },
        tickerScroll: {
          "0%": { transform: "translateX(100%)" },
          "100%": { transform: "translateX(-100%)" },
        },
        blink: {
          "0%, 100%": { opacity: 1 },
          "50%": { opacity: 0 },
        },
      },
      boxShadow: {
        "pos-glow": "0 0 12px rgba(0,255,136,0.3)",
        "neg-glow": "0 0 12px rgba(255,51,85,0.3)",
        "inner-border": "inset 0 0 0 1px rgba(255,255,255,0.06)",
      },
    },
  },
  plugins: [],
};
