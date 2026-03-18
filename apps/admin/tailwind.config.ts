import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
    "./public/**/*.{html,js}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#0b1017",
        steel: "#121926",
        mist: "#c5d0df",
        pearl: "#eff5ff",
        aurora: "#2dd4bf",
        ember: "#ff7a59",
        gold: "#d8b774"
      },
      boxShadow: {
        glass: "0 24px 80px rgba(5, 12, 23, 0.28)"
      },
      backgroundImage: {
        "mesh-soft":
          "radial-gradient(circle at top left, rgba(45, 212, 191, 0.16), transparent 38%), radial-gradient(circle at top right, rgba(255, 122, 89, 0.14), transparent 34%), linear-gradient(180deg, #0b1017 0%, #101826 48%, #0e1520 100%)"
      }
    }
  },
  plugins: []
};

export default config;
