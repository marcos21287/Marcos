import { NextResponse, type NextRequest } from "next/server";
import { json, validSymbol } from "@/lib/api";
import { getAnalysis, getStockNews } from "@/lib/yahoo";

export async function GET(req: NextRequest, { params }: { params: Promise<{ symbol: string }> }) {
  const symbol = decodeURIComponent((await params).symbol);
  if (!validSymbol(symbol)) return NextResponse.json({ error: "Símbolo no válido" }, { status: 400 });
  const withNews = req.nextUrl.searchParams.get("news") !== "0";
  return json(async () => {
    const analysis = await getAnalysis(symbol);
    const news = withNews ? await getStockNews(analysis.symbol, [analysis.shortName, analysis.name]).catch(() => []) : [];
    return { ...analysis, news };
  });
}
