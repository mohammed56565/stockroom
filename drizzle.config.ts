import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./migrations",
  schema: "./backend/src/db/schema.ts",
  dialect: "sqlite",
});
