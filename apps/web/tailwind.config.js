/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        helm: {
          bg: "var(--helm-bg)",
          surface: "var(--helm-surface)",
          border: "var(--helm-border)",
          muted: "var(--helm-muted)",
          accent: "var(--helm-accent)",
          success: "var(--helm-success)",
          warning: "var(--helm-warning)",
          error: "var(--helm-error)",
        },
      },
    },
  },
  plugins: [],
};
