import { NextResponse } from "next/server";

/**
 * Ejecuta una carga de datos y devuelve JSON, o un error 502 legible si falla la fuente.
 * `cdnSeconds` deja que la red del alojamiento guarde la respuesta correcta ese tiempo, para
 * no repetir las peticiones a Yahoo en cada visita (los errores nunca se guardan).
 */
export async function json<T>(load: () => Promise<T>, cdnSeconds = 0, staleSeconds = cdnSeconds * 4) {
  try {
    const headers = cdnSeconds ? { "Cache-Control": `public, s-maxage=${cdnSeconds}, stale-while-revalidate=${staleSeconds}` } : undefined;
    return NextResponse.json(await load(), { headers });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: `No se pudieron obtener los datos de Yahoo Finance: ${message}` }, { status: 502 });
  }
}

export const validSymbol = (s: string) => /^[A-Za-z0-9.^=\-]{1,15}$/.test(s);
