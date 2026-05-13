import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { taskItems, tasks } from "@/lib/schema";
import { eq, or, and, sql } from "drizzle-orm";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const droneIdParam = url.searchParams.get("droneId");
    const droneId = droneIdParam ? Number(droneIdParam) : null;

    if (!droneId) {
      return NextResponse.json(
        { ok: false, error: "droneId required" },
        { status: 400 },
      );
    }

    console.debug("/api/tasks/for-drone: fetching tasks for droneId", droneId);

    // First find tasks that are pending and either unassigned or assigned to this drone
    let taskRows;
    try {
      // Use explicit IS NULL check for droneId instead of eq(..., null) to avoid SQL generation issues
      taskRows = await db
        .select()
        .from(tasks)
        .where(
          and(
            eq(tasks.status, "pending"),
            or(eq(tasks.droneId, droneId), sql`${tasks.droneId} IS NULL`),
          ),
        );
    } catch (qerr) {
      console.error("/api/tasks/for-drone: task query error", qerr);
      throw qerr;
    }

    const taskIds = taskRows.map((t: any) => t.id);
    if (taskIds.length === 0) {
      return NextResponse.json({ ok: true, tasks: [] });
    }

    // Fetch items for these tasks
    let items;
    try {
      if (taskIds.length === 1) {
        items = await db
          .select()
          .from(taskItems)
          .where(eq(taskItems.taskId, taskIds[0]));
      } else {
        // Build OR chain of equality checks as a workaround for missing 'in' helper
        const conds = taskIds.map((id) => eq(taskItems.taskId, id));
        items = await db
          .select()
          .from(taskItems)
          .where(or(...(conds as any)));
      }
    } catch (ierr) {
      console.error("/api/tasks/for-drone: taskItems query error", ierr);
      throw ierr;
    }

    // Group items by taskId
    const byTask = new Map<number, any[]>();
    for (const it of items) {
      const tid = Number((it as any).taskId);
      if (!byTask.has(tid)) byTask.set(tid, []);
      byTask.get(tid)!.push(it);
    }

    const result = taskRows.map((t: any) => ({
      task: { id: t.id, title: t.title, description: t.description },
      items: byTask.get(t.id) || [],
    }));

    return NextResponse.json({ ok: true, tasks: result });
  } catch (err) {
    console.error("/api/tasks/for-drone error", err);
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 },
    );
  }
}
