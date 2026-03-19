import type { Config } from "tailwindcss";

const config: Config = {
  // ... your existing theme/content settings ...
  plugins: [
    require("tailwindcss-animate"),
    require("@tailwindcss/typography"),
  ],
};

export default config;