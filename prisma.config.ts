import { defineConfig } from "@prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: "file:./dev.db" // Hardcoded directly into the engine!
  }
});