import { NextResponse } from "next/server";
import { createTaskWithItems } from "@/app/actions";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const form = new FormData();
    if (body.title) form.append("title", String(body.title));
    if (body.description) form.append("description", String(body.description));
    if (body.items) form.append("items", JSON.stringify(body.items));
    if (body.droneId) form.append("droneId", String(body.droneId));
    if (body.patrolRadiusMeters !== undefined)
      form.append("patrolRadiusMeters", String(body.patrolRadiusMeters));
    if (body.patrolDurationSeconds !== undefined)
      form.append("patrolDurationSeconds", String(body.patrolDurationSeconds));

    const res = await createTaskWithItems(form);
    return NextResponse.json(res);
  } catch (err) {
    console.error("/api/tasks POST error", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
