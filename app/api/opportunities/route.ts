import { json } from "@/lib/api";
import { getOpportunities } from "@/lib/yahoo";

export const dynamic = "force-dynamic";

export function GET() {
  return json(() => getOpportunities());
}
