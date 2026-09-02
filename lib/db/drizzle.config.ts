import { defineConfig } from "drizzle-kit";
import path from "path";

// Same precedence as src/index.ts, so a push can never target a different
// database than the one the running app is connected to.
const connectionString =
  process.env.BRAVE_DATABASE_URL ??
  process.env.NEON_DATABASE_URL ??
  process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "BRAVE_DATABASE_URL, NEON_DATABASE_URL or DATABASE_URL must be set; ensure the database is provisioned",
  );
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: connectionString,
  },
});
