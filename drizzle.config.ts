import { defineConfig } from "drizzle-kit";

export default defineConfig({
    schema: "./src/lib/schema.ts",          // path to schema tables
    out: "./drizzle",                       // directory to output migration files
    dialect: "postgresql",
    dbCredentials: {
        url: process.env.DATABASE_URL!,     // database connection string, env thingies
    }
})