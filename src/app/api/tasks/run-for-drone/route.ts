import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tasks, taskItems } from "@/lib/schema";
import { eq, and, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const droneId = body && body.droneId ? Number(body.droneId) : null;
    if (!droneId || Number.isNaN(droneId)) {
      return NextResponse.json(
        { ok: false, error: "droneId required" },
        { status: 400 },
      );
    }

    console.debug(
      "/api/tasks/run-for-drone: starting tasks for drone",
      droneId,
    );

    // Find pending tasks that are either unassigned or assigned to the drone
    const rows = await db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.status, "pending"),
          or(eq(tasks.droneId, droneId), sql`${tasks.droneId} IS NULL`),
        ),
      );

    if (!rows || rows.length === 0) {
      return NextResponse.json({ ok: true, started: [] });
    }

    const started: any[] = [];

    for (const t of rows) {
      try {
        const updateData: any = { status: "started", startedAt: new Date() };
        if (t.droneId == null) updateData.droneId = droneId;
        await db.update(tasks).set(updateData).where(eq(tasks.id, t.id));

        // Fetch items for this task
        const items = await db
          .select()
          .from(taskItems)
          .where(eq(taskItems.taskId, t.id));

        const itemsDto = (items || []).map((it: any) => ({
          id: it.id,
          itemId: it.itemId,
          quantity: Number(it.quantity),
          deliveryLatitude: it.deliveryLatitude
            ? String(it.deliveryLatitude)
            : null,
          deliveryLongitude: it.deliveryLongitude
            ? String(it.deliveryLongitude)
            : null,
          sequence: Number(it.sequence),
        }));

        started.push({
          task: {
            id: t.id,
            title: t.title,
            description: t.description,
            quantity: Number(t.quantity),
            droneId: updateData.droneId ?? t.droneId,
          },
          items: itemsDto,
        });
        console.debug("/api/tasks/run-for-drone: started task", { taskId: t.id, droneId, items: itemsDto });
      } catch (err) {
        console.error(
          `/api/tasks/run-for-drone: failed to start task ${t.id}`,
          err,
        );
      }
    }

    // Revalidate pages that list tasks and map
    try {
      revalidatePath("/dashboard/tasks");
      revalidatePath("/dashboard/map");
    } catch (e) {
      // ignore revalidation errors in dev
    }

    console.debug("/api/tasks/run-for-drone: response payload", { started });
    return NextResponse.json({ ok: true, started });
  } catch (err) {
    console.error("/api/tasks/run-for-drone error", err);
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 },
    );
  }
}
