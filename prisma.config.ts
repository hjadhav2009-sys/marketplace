import "dotenv/config";
import { defineConfig, env } from "prisma/config";

const databaseUrl = process.env.DATABASE_URL ?? "";
const usingPostgres = databaseUrl.startsWith("postgres://") || databaseUrl.startsWith("postgresql://");

export default defineConfig({
  schema: usingPostgres ? "prisma/schema.postgres.prisma" : "prisma/schema.prisma",
  migrations: {
    path: usingPostgres ? "prisma/migrations-postgres" : "prisma/migrations",
    seed: "tsx prisma/seed.ts"
  },
  engine: "classic",
  datasource: {
    url: env("DATABASE_URL")
  }
});
