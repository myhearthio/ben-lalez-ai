import { createClient } from "@supabase/supabase-js";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { config } from "dotenv";

config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runMigrations() {
  const migrationsDir = join(import.meta.dirname, "migrations");
  const files = (await readdir(migrationsDir))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  console.log(`Found ${files.length} migration files\n`);

  for (const file of files) {
    console.log(`Running: ${file}`);
    const sql = await readFile(join(migrationsDir, file), "utf-8");

    const { error } = await supabase.rpc("exec_sql", { query: sql });

    if (error) {
      console.error(`  FAILED: ${error.message}`);
      process.exit(1);
    }

    console.log(`  OK\n`);
  }

  console.log("All migrations applied successfully.");
}

runMigrations();
