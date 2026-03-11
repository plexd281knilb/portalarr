import { defineConfig } from "@prisma/config";
import path from "path";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    // Force an absolute path here too so the CLI never guesses
    url: `file:${path.join(process.cwd(), "prisma", "dev.db")}`
  }
});