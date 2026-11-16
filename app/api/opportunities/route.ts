import { json } from "@/lib/api";
import { getOpportunities } from "@/lib/yahoo";

export const dynamic = "force-dynamic";
// La revisión completa tarda cerca de un minuto la primera vez.
export const maxDuration = 60;

export function GET() {
  return json(() => getOpportunities(), 3600);
}
