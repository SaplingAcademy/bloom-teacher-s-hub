import { readFileSync } from "fs";
import { resolve } from "path";
import postgres from "postgres";
import readline from "readline";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const PROJECT_ID = "aczmcryftlozjqkauvpc";
const DB_HOST = `db.${PROJECT_ID}.supabase.co`;
const DB_PORT = 5432;
const DB_USER = "postgres";
const DB_NAME = "postgres";

console.log("=========================================");
console.log("Bloom Database Migration Tool");
console.log("=========================================");
console.log(`Target Host: ${DB_HOST}`);
console.log(`Database: ${DB_NAME}`);
console.log(`User: ${DB_USER}\n`);

rl.question("Please enter your Supabase Database Password: ", async (password) => {
  rl.close();

  if (!password) {
    console.error("❌ Password cannot be empty.");
    process.exit(1);
  }

  // Construct connection URL
  const connectionString = `postgresql://${DB_USER}:${encodeURIComponent(password)}@${DB_HOST}:${DB_PORT}/${DB_NAME}`;

  console.log("\nConnecting to Supabase Database...");
  const sql = postgres(connectionString, {
    ssl: "require",
    connect_timeout: 10,
  });

  try {
    const schemaPath = resolve(__dirname, "supabase_schema.sql");
    console.log(`Reading SQL schema file: ${schemaPath}`);
    const sqlContent = readFileSync(schemaPath, "utf-8");

    console.log("Applying complete Bloom database schema (this may take a few seconds)...");

    // Execute the complete schema script
    await sql.unsafe(sqlContent);

    console.log("\n=========================================");
    console.log("✅ SUCCESS: Database schema applied successfully!");
    console.log("All tables, columns, indexes, triggers, and RLS policies are active.");
    console.log("=========================================");
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("\n❌ ERROR: Migration failed!");
    console.error(err.message || err);
    console.log("\nTroubleshooting tips:");
    console.log("1. Double check your database password (not your Supabase login password).");
    console.log("2. Ensure your Supabase project is active (not paused).");
    console.log(
      "3. You can also manually copy the contents of 'supabase_schema.sql' and paste it in the SQL Editor on the Supabase Dashboard.",
    );
  } finally {
    await sql.end();
    process.exit(0);
  }
});
