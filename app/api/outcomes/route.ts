import { NextResponse, type NextRequest } from "next/server";
import { json, validSymbol } from "@/lib/api";
import { getOutcomes, type OutcomeRequest } from "@/lib/yahoo";

export const maxDuration = 60;

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { items?: unknown } | null;
  if (!body || !Array.isArray(body.items)) return NextResponse.json({ error: "Petición no válida" }, { status: 400 });
  const items = (body.items as OutcomeRequest[]).filter(
    (i) => i && typeof i.id === "string" && typeof i.symbol === "string" && validSymbol(i.symbol) && finite(i.since) && finite(i.entry) && finite(i.stop) && finite(i.target) && i.entry > i.stop,
  );
  return json(() => getOutcomes(items));
}
