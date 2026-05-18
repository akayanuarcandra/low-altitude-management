import { NextResponse } from "next/server";
import { createTaskWithItemsFromJSON } from "@/app/actions";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    // Forward the request body directly so server-side validation (including
    // patrol soft-disable) runs against the original payload.
    const res = await createTaskWithItemsFromJSON(body);
    return NextResponse.json(res);
  } catch (err) {
    console.error("/api/tasks POST error", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
