// tailwind.config.ts (usually in the root folder)
import type { Config } from "tailwindcss";

const config: Config = {
  // ... your other config ...
  plugins: [
    require("tailwindcss-animate"),
    require("@tailwindcss/typography"), // <--- THIS IS THE FIX
  ],
};
export default config;