import type { NextRequest } from "next/server";
import { json } from "@/lib/api";
import { searchSymbols } from "@/lib/yahoo";

export function GET(req: NextRequest) {
  return json(() => searchSymbols(req.nextUrl.searchParams.get("q") ?? ""), 600);
}
