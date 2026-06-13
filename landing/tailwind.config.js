/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#102b2c",
        teal: {
          900: "#143536",
          800: "#1a4143",
          700: "#235052",
          600: "#2f6063",
          500: "#4b7c80",
          400: "#6a989b",
        },
        ivory: {
          DEFAULT: "#efe9d6",
          soft: "rgba(239, 233, 214, 0.72)",
          dim: "rgba(239, 233, 214, 0.46)",
          faint: "rgba(239, 233, 214, 0.12)",
        },
        bronze: {
          DEFAULT: "#c6a868",
          soft: "#a98f57",
          glow: "rgba(198, 168, 104, 0.18)",
        },
      },
      fontFamily: {
        serif: ["Italiana", "Times New Roman", "serif"],
        sans: ["Manrope", "system-ui", "sans-serif"],
        script: ["Marck Script", "cursive"],
      },
      maxWidth: {
        content: "1240px",
      },
    },
  },
  plugins: [],
};
