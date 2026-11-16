import type { NextRequest } from "next/server";
import { json, validSymbol } from "@/lib/api";
import { getQuotes } from "@/lib/yahoo";

export function GET(req: NextRequest) {
  const symbols = (req.nextUrl.searchParams.get("symbols") ?? "").split(",").filter(validSymbol);
  return json(() => getQuotes(symbols), 30);
}
