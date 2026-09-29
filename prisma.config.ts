import "dotenv/config";
import { defineConfig } from "prisma/config";

/**
 * Prisma CLI configuration (Prisma 7+).
 *
 * The schema no longer carries `url`; the CLI reads it from here while
 * migrate/migrate-deploy run, and the app supplies it separately through
 * the pg driver adapter in `src/lib/prisma.ts`.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Read directly rather than via `env()` so that `prisma generate` and
    // `prisma validate` still work in CI without a database URL.
    url: process.env.DATABASE_URL ?? "",
  },
});
