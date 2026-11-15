import { NextResponse } from "next/server";

/** Ejecuta una carga de datos y devuelve JSON, o un error 502 legible si falla la fuente. */
export async function json<T>(load: () => Promise<T>) {
  try {
    return NextResponse.json(await load());
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: `No se pudieron obtener los datos de Yahoo Finance: ${message}` }, { status: 502 });
  }
}

export const validSymbol = (s: string) => /^[A-Za-z0-9.^=\-]{1,15}$/.test(s);
