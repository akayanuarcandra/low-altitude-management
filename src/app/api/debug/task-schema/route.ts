import { NextResponse } from "next/server";
import { Pool } from "pg";

export async function GET() {
  try {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const colsRes = await pool.query(
      `SELECT column_name, data_type, is_nullable
       FROM information_schema.columns
       WHERE table_name = 'Task'
       ORDER BY ordinal_position;`,
    );

    const countRes = await pool.query(`SELECT count(*) as cnt FROM "Task";`);

    // Do not call pool.end() here to avoid closing shared pool in some envs; allow GC.
    return NextResponse.json({
      ok: true,
      columns: colsRes.rows,
      taskCount: countRes.rows[0]?.cnt ?? null,
    });
  } catch (err) {
    console.error("/api/debug/task-schema error", err);
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 },
    );
  }
}
