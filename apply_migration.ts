import { readFileSync } from "fs";
import { resolve } from "path";
import postgres from "postgres";
import readline from "readline";

// Uso: bun apply_migration.ts supabase/migrations/20260817000000_unified_lesson_plans.sql
const fileArg = process.argv[2] || "supabase/migrations/20260817000000_unified_lesson_plans.sql";

const PROJECT_ID = "aczmcryftlozjqkauvpc";
const connectionHost = `db.${PROJECT_ID}.supabase.co`;

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

rl.question(`Senha do banco (${connectionHost}): `, async (password) => {
  rl.close();
  if (!password) {
    console.error("Senha vazia.");
    process.exit(1);
  }

  const sql = postgres(
    `postgresql://postgres:${encodeURIComponent(password)}@${connectionHost}:5432/postgres`,
    { ssl: "require", connect_timeout: 10 },
  );

  try {
    const path = resolve(process.cwd(), fileArg);
    console.log(`Aplicando migration: ${path}`);
    await sql.unsafe(readFileSync(path, "utf-8"));
    console.log("✅ Migration aplicada com sucesso.");

    const conflicts = await sql`
      select reason, count(*)::int as total
      from public.bloom_backfill_conflicts
      where resolved = false
      group by reason order by reason`;
    if (conflicts.length === 0) {
      console.log("Nenhuma ambiguidade de backfill registrada.");
    } else {
      console.log("Ambiguidades registradas em bloom_backfill_conflicts (resolução manual):");
      for (const row of conflicts) console.log(` - ${row.reason}: ${row.total}`);
    }
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("❌ Falha ao aplicar a migration (transação revertida):");
    console.error(err.message);
    process.exitCode = 1;
  } finally {
    await sql.end();
  }
});
