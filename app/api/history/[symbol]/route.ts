import { NextResponse, type NextRequest } from "next/server";
import { json, validSymbol } from "@/lib/api";
import { getHistory, RANGES, type Range } from "@/lib/yahoo";

export async function GET(req: NextRequest, { params }: { params: Promise<{ symbol: string }> }) {
  const symbol = decodeURIComponent((await params).symbol);
  const range = (req.nextUrl.searchParams.get("range") ?? "1M") as Range;
  if (!validSymbol(symbol) || !RANGES.includes(range)) return NextResponse.json({ error: "Petición no válida" }, { status: 400 });
  return json(() => getHistory(symbol.toUpperCase(), range));
}
