import type { Config } from "tailwindcss";

const config: Config = {
  // CRITICAL: This tells Tailwind where to apply the "prose" styling
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [
    require("tailwindcss-animate"),
    require("@tailwindcss/typography"), //
  ],
};

export default config;