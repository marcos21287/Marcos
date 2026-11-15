export function money(v: number | null | undefined, currency: string, digits = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  if (!currency) return v.toLocaleString("es-ES", { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: "always" });
  try {
    return v.toLocaleString("es-ES", { style: "currency", currency, minimumFractionDigits: digits, maximumFractionDigits: digits });
  } catch {
    return `${v.toFixed(digits).replace(".", ",")} ${currency}`;
  }
}

export function signedPct(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(digits).replace(".", ",")} %`;
}

export function plain(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return v.toLocaleString("es-ES", { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: "always" });
}

/** Números grandes abreviados: 1,2 M, 3,4 mM, 1,1 B (billón español). */
export function compact(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  const f = (x: number) => x.toLocaleString("es-ES", { maximumFractionDigits: 1 });
  if (a >= 1e12) return `${f(v / 1e12)} B`;
  if (a >= 1e9) return `${f(v / 1e9)} mM`;
  if (a >= 1e6) return `${f(v / 1e6)} M`;
  return f(v);
}

export function timeAgo(t: number | null): string {
  if (!t) return "";
  const min = Math.round((Date.now() - t) / 60000);
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? "ayer" : `hace ${d} días`;
}

export function parseNumber(text: string): number | null {
  const v = parseFloat(text.trim().replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(v) && v > 0 ? v : null;
}
