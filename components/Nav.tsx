"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useFetch } from "@/lib/useFetch";
import { useStore } from "@/lib/store";
import type { SearchHit } from "@/lib/yahoo";

const LINKS = [
  { href: "/", label: "Mercado" },
  { href: "/oportunidades", label: "Oportunidades" },
  { href: "/alertas", label: "Alertas" },
];

export function Nav() {
  const path = usePathname();
  const router = useRouter();
  const [state] = useStore();
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQuery(text.trim()), 300);
    return () => clearTimeout(t);
  }, [text]);
  const { data, loading, error } = useFetch<SearchHit[]>(query.length >= 2 ? `/api/search?q=${encodeURIComponent(query)}` : null);
  const triggered = state.alerts.filter((a) => a.status === "triggered").length;
  const go = (symbol: string) => {
    setText("");
    setQuery("");
    router.push(`/accion/${encodeURIComponent(symbol)}`);
  };
  return (
    <header className="nav">
      <Link href="/" className="brand">
        <svg aria-hidden="true" width="28" height="28" viewBox="0 0 28 28" fill="none">
          <rect width="28" height="28" rx="7" fill="var(--accent)" />
          <path d="M6 18l5-6 4 4 7-9" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Vigía
      </Link>
      <nav aria-label="Principal" className="nav-links">
        {LINKS.map((l) => {
          const active = l.href === "/" ? path === "/" || path.startsWith("/accion") : path.startsWith(l.href);
          return (
            <Link key={l.href} href={l.href} aria-current={active ? "page" : undefined} className={active ? "active" : ""}>
              {l.label}
              {l.href === "/alertas" && triggered > 0 && <span className="badge">{triggered}</span>}
            </Link>
          );
        })}
      </nav>
      <div className="search">
        <label className="search-box">
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-4-4" />
          </svg>
          <input
            type="search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-label="Buscar acción, índice o ticker"
            placeholder="Buscar acción, índice o ticker"
          />
        </label>
        {query.length >= 2 && (
          <div className="search-results">
            {loading && <p className="empty">Buscando…</p>}
            {error && <p className="empty">{error}</p>}
            {data && data.length === 0 && <p className="empty">Sin resultados para «{query}».</p>}
            {data?.map((h) => (
              <button key={h.symbol} type="button" onClick={() => go(h.symbol)}>
                <span className="ticker">{h.symbol}</span>
                <span className="grow">{h.name}</span>
                <span className="muted small">{h.exchange}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </header>
  );
}
