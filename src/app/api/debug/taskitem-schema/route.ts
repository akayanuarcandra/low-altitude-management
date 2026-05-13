import { NextResponse } from "next/server";
import { Pool } from "pg";

export async function GET() {
  try {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const colsRes = await pool.query(
      `SELECT column_name, data_type, is_nullable
       FROM information_schema.columns
       WHERE table_name = 'taskitem' OR table_name = 'taskitem' OR table_name = 'taskitem' OR table_name = 'taskitem' OR table_name = 'TaskItem'
       ORDER BY ordinal_position;`,
    );
    return NextResponse.json({ ok: true, columns: colsRes.rows });
  } catch (err) {
    console.error('/api/debug/taskitem-schema error', err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
