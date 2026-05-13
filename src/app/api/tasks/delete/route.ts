import { NextResponse } from "next/server";
import { deleteTaskWithItems } from "@/app/actions";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const taskId = Number(body?.taskId);
    if (Number.isNaN(taskId) || taskId <= 0) {
      return NextResponse.json({ ok: false, error: "taskId required" }, { status: 400 });
    }

    try {
      await deleteTaskWithItems(taskId);
      return NextResponse.json({ ok: true });
    } catch (err) {
      console.error("/api/tasks/delete error deleting", err);
      return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
    }
  } catch (err) {
    console.error("/api/tasks/delete error parsing body", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
