"use client";
import { useEffect, useState } from "react";

interface Result<T> {
  url: string | null;
  data: T | null;
  error: string | null;
}

/** Carga JSON de una URL. `refreshMs` vuelve a pedirlo periódicamente. */
export function useFetch<T>(url: string | null, refreshMs = 0) {
  const [res, setRes] = useState<Result<T>>({ url: null, data: null, error: null });
  useEffect(() => {
    if (!url) return;
    let alive = true;
    const load = () =>
      fetch(url)
        .then(async (r) => {
          const body = await r.json();
          if (!r.ok) throw new Error(body?.error ?? `Error ${r.status}`);
          return body as T;
        })
        .then((data) => alive && setRes({ url, data, error: null }))
        .catch((e: Error) => alive && setRes((prev) => ({ url, data: prev.url === url ? prev.data : null, error: e.message })));
    load();
    const timer = refreshMs ? setInterval(load, refreshMs) : null;
    return () => {
      alive = false;
      if (timer) clearInterval(timer);
    };
  }, [url, refreshMs]);
  const fresh = res.url === url;
  return { data: fresh ? res.data : null, error: fresh ? res.error : null, loading: !!url && !fresh };
}
