import type { Metadata } from "next";
import { AlertRunner } from "@/components/AlertRunner";
import { Nav } from "@/components/Nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vigía · análisis de bolsa y alertas",
  description: "Sigue tus acciones, revisa sus fundamentales automáticamente y recibe alertas.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <Nav />
        <AlertRunner />
        <main className="page">{children}</main>
        <footer className="footer">
          Datos de Yahoo Finance, con retraso. Vigía aplica filtros estadísticos: no son recomendaciones de inversión y puedes perder
          parte o todo tu capital.
        </footer>
      </body>
    </html>
  );
}
