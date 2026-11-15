// Tablas para situar cada acción en su país y sector.

/** País (según Yahoo) → índice bursátil, código ISO del Banco Mundial y nombre en español. */
export const COUNTRIES: Record<string, { index: string; iso: string; name: string }> = {
  Spain: { index: "^IBEX", iso: "ESP", name: "España" },
  "United States": { index: "^GSPC", iso: "USA", name: "Estados Unidos" },
  Germany: { index: "^GDAXI", iso: "DEU", name: "Alemania" },
  France: { index: "^FCHI", iso: "FRA", name: "Francia" },
  Netherlands: { index: "^AEX", iso: "NLD", name: "Países Bajos" },
  Italy: { index: "FTSEMIB.MI", iso: "ITA", name: "Italia" },
  "United Kingdom": { index: "^FTSE", iso: "GBR", name: "Reino Unido" },
  Switzerland: { index: "^SSMI", iso: "CHE", name: "Suiza" },
  Belgium: { index: "^BFX", iso: "BEL", name: "Bélgica" },
  Finland: { index: "^OMXH25", iso: "FIN", name: "Finlandia" },
  Ireland: { index: "^ISEQ", iso: "IRL", name: "Irlanda" },
  Canada: { index: "^GSPTSE", iso: "CAN", name: "Canadá" },
  Brazil: { index: "^BVSP", iso: "BRA", name: "Brasil" },
  Japan: { index: "^N225", iso: "JPN", name: "Japón" },
  China: { index: "000001.SS", iso: "CHN", name: "China" },
  Luxembourg: { index: "^STOXX50E", iso: "LUX", name: "Luxemburgo" },
};

/** Sector (según Yahoo) → fondo cotizado sectorial usado como termómetro global, y nombre en español. */
export const SECTORS: Record<string, { etf: string; name: string }> = {
  Technology: { etf: "XLK", name: "Tecnología" },
  "Financial Services": { etf: "XLF", name: "Finanzas" },
  Healthcare: { etf: "XLV", name: "Salud" },
  "Consumer Cyclical": { etf: "XLY", name: "Consumo cíclico" },
  "Consumer Defensive": { etf: "XLP", name: "Consumo defensivo" },
  Energy: { etf: "XLE", name: "Energía" },
  Industrials: { etf: "XLI", name: "Industria" },
  "Basic Materials": { etf: "XLB", name: "Materiales" },
  Utilities: { etf: "XLU", name: "Servicios públicos" },
  "Real Estate": { etf: "XLRE", name: "Inmobiliario" },
  "Communication Services": { etf: "XLC", name: "Comunicaciones" },
};

export const WB_INDICATORS = { gdp: "NY.GDP.MKTP.KD.ZG", inflation: "FP.CPI.TOTL.ZG", unemployment: "SL.UEM.TOTL.ZS" } as const;
