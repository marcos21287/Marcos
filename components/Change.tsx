import { signedPct } from "@/lib/format";

export function Arrow({ up }: { up: boolean }) {
  return (
    <svg aria-hidden="true" width="9" height="9" viewBox="0 0 10 10">
      <path d={up ? "M5 1l4 8H1z" : "M5 9L1 1h8z"} fill="currentColor" />
    </svg>
  );
}

export function Change({ pct, pill = false, suffix = "" }: { pct: number | null; pill?: boolean; suffix?: string }) {
  if (pct === null) return <span className="muted">—</span>;
  const up = pct >= 0;
  return (
    <span className={`change ${up ? "up" : "down"} ${pill ? "pill" : ""}`}>
      <Arrow up={up} />
      {signedPct(pct)}
      {suffix}
    </span>
  );
}
