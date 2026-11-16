"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Outcome } from "@/lib/indicators";
import { money, plain } from "@/lib/format";
import { useStore, type TrackedPick } from "@/lib/store";
import { settlePicks } from "@/lib/tracking";

const MIN_SAMPLE = 30;
const LABEL = { abierta: "Abierta", objetivo: "Llegó al objetivo", stop: "Saltó el stop", plazo: "Fin del plazo" } as const;
const day = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
const signedR = (r: number) => `${r >= 0 ? "+" : "−"}${plain(Math.abs(r), 2)} R`;
const tone = (v: number) => (v >= 0 ? "up-text" : "down-text");
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

const BANDS: { label: string; test: (p: TrackedPick) => boolean }[] = [
  { label: "Nota de 85 % o más", test: (p) => p.score !== null && p.score >= 0.85 },
  { label: "Nota entre 75 % y 85 %", test: (p) => p.score !== null && p.score >= 0.75 && p.score < 0.85 },
  { label: "Nota por debajo del 75 %", test: (p) => p.score !== null && p.score < 0.75 },
  { label: "Señal: ruptura", test: (p) => p.signal === "Ruptura" },
  { label: "Señal: tendencia", test: (p) => p.signal === "Tendencia" },
  { label: "Señal: sobreventa", test: (p) => p.signal === "Sobreventa" },
  { label: "Puestos 1 a 5 de la lista", test: (p) => p.rank <= 5 },
  { label: "Puestos 6 a 10 de la lista", test: (p) => p.rank > 5 },
];

export default function Aciertos() {
  const [state, update] = useStore();
  const [live, setLive] = useState<Record<string, Outcome>>({});
  const [checked, setChecked] = useState(false);
  const openCount = state.picks.filter((p) => !p.result).length;
  useEffect(() => {
    let alive = true;
    settlePicks()
      .then((o) => alive && setLive(o))
      .catch(() => {})
      .finally(() => alive && setChecked(true));
    return () => {
      alive = false;
    };
  }, [openCount]);

  const picks = state.picks;
  const closed = picks.filter((p) => p.result);
  const open = picks.filter((p) => !p.result);
  const wins = closed.filter((p) => p.result!.status === "objetivo").length;
  const avgR = mean(closed.map((p) => p.result!.r));
  const expectedR = mean(closed.filter((p) => p.expectedR !== null).map((p) => p.expectedR as number));
  const latent = mean(open.map((p) => live[p.id]?.r).filter((r): r is number => r !== undefined));
  const days = new Set(picks.map((p) => p.day)).size;
  const enough = closed.length >= MIN_SAMPLE;
  const clear = () => {
    if (window.confirm("¿Borrar todo el seguimiento registrado?")) update((s) => ({ ...s, picks: [] }));
  };

  return (
    <>
      <div className="head">
        <div>
          <h1>¿Va acertando?</h1>
          <p className="muted">
            Cada día que abres Vigía se apuntan solas las 10 mejores oportunidades, y después se comprueba con el histórico real de precios si
            llegaron al objetivo, saltó el stop o se agotó el plazo de 40 sesiones.
          </p>
        </div>
        {picks.length > 0 && <button type="button" className="btn" onClick={clear}>Vaciar seguimiento</button>}
      </div>

      {picks.length === 0 ? (
        <p className="card empty">
          Todavía no hay nada registrado. La primera lista se apunta sola en cuanto termine de cargar <Link href="/oportunidades">Oportunidades</Link>.
        </p>
      ) : (
        <>
          <section aria-label="Resumen" className="tiles">
            <div className="card tile">
              <span className="muted small">Oportunidades registradas</span>
              <span className="big">{picks.length}</span>
              <span className="muted small">En {days} {days === 1 ? "día" : "días"} · {open.length} abiertas · {closed.length} cerradas</span>
            </div>
            <div className="card tile">
              <span className="muted small">Llegaron al objetivo</span>
              <span className="big">{closed.length ? `${wins} de ${closed.length}` : "—"}</span>
              <span className="muted small">{closed.length ? `${Math.round((wins / closed.length) * 100)} %` : "Sin cerradas todavía"} · en la simulación, alrededor de un tercio</span>
            </div>
            <div className="card tile">
              <span className="muted small">Resultado medio de las cerradas</span>
              <span className={`big ${closed.length ? tone(avgR) : ""}`}>{closed.length ? signedR(avgR) : "—"}</span>
              <span className="muted small">{closed.length ? `Esperado según la simulación: ${signedR(expectedR)}` : "R = veces lo arriesgado"}</span>
            </div>
            <div className="card tile">
              <span className="muted small">Abiertas, de momento</span>
              <span className={`big ${open.length && checked ? tone(latent) : ""}`}>{open.length ? (checked ? signedR(latent) : "…") : "—"}</span>
              <span className="muted small">Resultado medio si se cerraran hoy</span>
            </div>
          </section>

          <p className={`card pad ${enough ? "" : "muted"}`}>
            {enough
              ? avgR > 0
                ? `Con ${closed.length} operaciones cerradas, la lista está ganando de media ${signedR(avgR)} por operación antes de costes (la simulación esperaba ${signedR(expectedR)}).`
                : `Con ${closed.length} operaciones cerradas, la lista está perdiendo de media ${signedR(avgR)} por operación antes de costes (la simulación esperaba ${signedR(expectedR)}).`
              : `Aún es pronto para sacar conclusiones: hay ${closed.length} cerradas y hacen falta al menos ${MIN_SAMPLE} para que el resultado signifique algo. Cada operación tarda unas tres semanas en cerrarse.`}
          </p>

          {closed.length > 0 && (
            <section className="card pad">
              <h2>Dónde acierta más</h2>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Grupo</th><th>Cerradas</th><th>Llegaron al objetivo</th><th>Resultado medio</th></tr>
                  </thead>
                  <tbody>
                    {BANDS.map((band) => {
                      const list = closed.filter(band.test);
                      const r = mean(list.map((p) => p.result!.r));
                      const w = list.filter((p) => p.result!.status === "objetivo").length;
                      return (
                        <tr key={band.label}>
                          <th scope="row">{band.label}</th>
                          <td>{list.length}</td>
                          <td>{list.length ? `${w} (${Math.round((w / list.length) * 100)} %)` : "—"}</td>
                          <td className={list.length ? tone(r) : ""}>{list.length ? signedR(r) : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section className="card pad">
            <h2>Todas las registradas</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Día</th><th>Puesto</th><th>Valor</th><th>Señal</th><th>Nota</th><th>Entrada</th><th>Stop / objetivo</th><th>Estado</th><th>Resultado</th><th>Sesiones</th></tr>
                </thead>
                <tbody>
                  {picks.map((p) => {
                    const o = p.result ?? live[p.id];
                    return (
                      <tr key={p.id}>
                        <td>{day(p.day)}</td>
                        <td>{p.rank}</td>
                        <th scope="row"><Link href={`/accion/${encodeURIComponent(p.symbol)}`}>{p.symbol.replace(".MC", "")}</Link></th>
                        <td>{p.signal}</td>
                        <td>{p.score === null ? "—" : `${Math.round(p.score * 100)} %`}</td>
                        <td>{money(p.entry, p.currency)}</td>
                        <td>{money(p.stop, p.currency)} / {money(p.target, p.currency)}</td>
                        <td>{o ? LABEL[o.status] : checked ? "Sin datos" : "…"}</td>
                        <td className={o ? tone(o.r) : ""}>{o ? `${signedR(o.r)} · ${money(o.exit, p.currency)}` : "…"}</td>
                        <td>{o ? o.days : "…"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <p className="muted small">
        Un valor que repite en la lista varios días cuenta una sola vez mientras su operación siga abierta. Los resultados son antes de
        comisiones, cambio de divisa e impuestos. El registro se guarda en este navegador y solo se apuntan los días en que abres la app.
      </p>
    </>
  );
}
