"use client";
// Estado del usuario guardado en el navegador (localStorage): lista, alertas, capital y avisos.
import { useSyncExternalStore } from "react";
import type { CheckStatus } from "./checks";

export interface PriceAlert {
  id: string;
  symbol: string;
  cond: "above" | "below";
  target: number;
  currency: string;
  status: "active" | "triggered" | "paused";
  triggeredAt?: number;
}

export interface Notice {
  id: string;
  symbol: string;
  text: string;
  at: number;
  good: boolean;
}

/** Operación simulada del diario (sin dinero real). Los importes en euros usan el cambio del día de la compra. */
export interface PaperTrade {
  id: string;
  symbol: string;
  name: string;
  currency: string;
  sector: string | null;
  signal: string;
  /** Nota total al abrir, como fracción de controles cumplidos. */
  score?: number | null;
  shares: number;
  entry: number;
  stop: number;
  target: number;
  /** Unidades de la divisa de la acción por cada euro al abrir. */
  rate: number;
  openedAt: number;
  /** Ganancia media esperada al abrir, en euros, después de costes y antes de impuestos. */
  expected: number | null;
  status: "open" | "closed";
  exit?: number;
  closedAt?: number;
  reason?: "objetivo" | "stop" | "plazo" | "manual";
}

/** Oportunidad registrada automáticamente para comprobar después si acertó. */
export interface TrackedPick {
  id: string;
  /** Día en que apareció en la lista (AAAA-MM-DD). */
  day: string;
  rank: number;
  symbol: string;
  name: string;
  currency: string;
  signal: string;
  score: number | null;
  entry: number;
  stop: number;
  target: number;
  at: number;
  /** Resultado medio histórico de su señal al registrarla, en múltiplos del riesgo. */
  expectedR: number | null;
  /** Resultado final, cuando ya se ha cerrado. */
  result?: { status: "objetivo" | "stop" | "plazo"; r: number; days: number; exit: number; exitAt: number | null; benchPct?: number | null };
}

export interface State {
  watchlist: string[];
  alerts: PriceAlert[];
  capital: number;
  risk: number;
  /** Acciones con vigilancia automática y el último estado conocido de cada control. */
  watched: Record<string, Record<string, CheckStatus>>;
  notices: Notice[];
  commission: number;
  fxPct: number;
  taxPct: number;
  trades: PaperTrade[];
  picks: TrackedPick[];
}

const KEY = "vigia:v1";

export const DEFAULT_STATE: State = {
  watchlist: ["SAN.MC", "ITX.MC", "IBE.MC", "BBVA.MC", "TEF.MC", "AAPL", "MSFT", "NVDA"],
  alerts: [],
  capital: 1000,
  risk: 2,
  watched: {},
  notices: [],
  commission: 1,
  fxPct: 0.5,
  taxPct: 19,
  trades: [],
  picks: [],
};

let current: State | null = null;
const listeners = new Set<() => void>();

function read(): State {
  if (current) return current;
  try {
    const raw = window.localStorage.getItem(KEY);
    current = raw ? { ...DEFAULT_STATE, ...(JSON.parse(raw) as Partial<State>) } : DEFAULT_STATE;
  } catch {
    current = DEFAULT_STATE;
  }
  return current;
}

export function getState(): State {
  return typeof window === "undefined" ? DEFAULT_STATE : read();
}

export function update(fn: (s: State) => State) {
  current = fn(read());
  try {
    window.localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // Sin almacenamiento (modo privado): el estado vive solo en memoria.
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      current = null;
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useStore(): [State, typeof update] {
  const state = useSyncExternalStore(subscribe, read, () => DEFAULT_STATE);
  return [state, update];
}

export const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export function addNotice(s: State, symbol: string, text: string, good: boolean): State {
  return { ...s, notices: [{ id: newId(), symbol, text, at: Date.now(), good }, ...s.notices].slice(0, 50) };
}

export function notify(title: string, body: string) {
  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    try {
      new Notification(title, { body });
    } catch {
      // Algunos navegadores móviles solo permiten notificaciones desde un service worker.
    }
  }
}
