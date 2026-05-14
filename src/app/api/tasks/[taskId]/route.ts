import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tasks, taskItems, waypoints } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { deleteTaskWithItems } from "@/app/actions";

export async function GET(
  req: Request,
  { params }: { params: { taskId: string } },
) {
  try {
    const taskId = Number(params.taskId);
    if (Number.isNaN(taskId) || taskId <= 0) {
      return NextResponse.json(
        { ok: false, error: "taskId required" },
        { status: 400 },
      );
    }

    const rows = await db.select().from(tasks).where(eq(tasks.id, taskId));
    if (!rows || rows.length === 0) {
      return NextResponse.json(
        { ok: false, error: "task not found" },
        { status: 404 },
      );
    }
    const t = rows[0];

    const items = await db
      .select()
      .from(taskItems)
      .where(eq(taskItems.taskId, taskId));

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

    const taskDto = {
      id: t.id,
      title: t.title,
      description: t.description,
      quantity: Number(t.quantity),
      patrolRadiusMeters: t.patrolRadiusMeters ?? null,
      patrolDurationSeconds: t.patrolDurationSeconds ?? null,
      droneId: t.droneId ?? null,
      status: t.status,
      createdAt: t.createdAt?.toISOString?.() ?? t.createdAt,
    };

    return NextResponse.json({ ok: true, task: taskDto, items: itemsDto });
  } catch (err) {
    console.error("/api/tasks/[taskId] GET error", err);
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 },
    );
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: { taskId: string } },
) {
  try {
    const taskId = Number(params.taskId);
    console.debug("/api/tasks/[taskId] DELETE called", taskId);
    if (Number.isNaN(taskId) || taskId <= 0) {
      return NextResponse.json(
        { ok: false, error: "taskId required" },
        { status: 400 },
      );
    }

    try {
      await deleteTaskWithItems(taskId);
      console.debug("/api/tasks/[taskId] DELETE success", taskId);
      return NextResponse.json({ ok: true });
    } catch (delErr) {
      console.error(
        "/api/tasks/[taskId] DELETE deleteTaskWithItems error",
        delErr,
      );
      return NextResponse.json(
        { ok: false, error: String(delErr) },
        { status: 500 },
      );
    }
  } catch (err) {
    console.error("/api/tasks/[taskId] DELETE error", err);
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 },
    );
  }
}

export async function PUT(
  req: Request,
  { params }: { params: { taskId: string } },
) {
  try {
    const taskId = Number(params.taskId);
    if (Number.isNaN(taskId) || taskId <= 0) {
      return NextResponse.json(
        { ok: false, error: "taskId required" },
        { status: 400 },
      );
    }

    const body = await req.json();
    const updateData: any = {};
    if (body.title !== undefined) updateData.title = String(body.title);
    if (body.description !== undefined)
      updateData.description =
        body.description === null ? null : String(body.description);
    if (body.patrolRadiusMeters !== undefined) {
      const n = Number(body.patrolRadiusMeters);
      if (!Number.isNaN(n)) updateData.patrolRadiusMeters = n;
      else updateData.patrolRadiusMeters = null;
    }
    if (body.patrolDurationSeconds !== undefined) {
      const n = Number(body.patrolDurationSeconds);
      if (!Number.isNaN(n)) updateData.patrolDurationSeconds = n;
      else updateData.patrolDurationSeconds = null;
    }
    if (body.quantity !== undefined) {
      const q = Number(body.quantity);
      if (!Number.isNaN(q)) updateData.quantity = q;
    }
    if (body.droneId !== undefined) {
      updateData.droneId = body.droneId === null ? null : Number(body.droneId);
    }

    if (Object.keys(updateData).length > 0) {
      await db.update(tasks).set(updateData).where(eq(tasks.id, taskId));
    }

    // NOTE: for now we do not handle updating task items here.

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("/api/tasks/[taskId] PUT error", err);
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 },
    );
  }
}
