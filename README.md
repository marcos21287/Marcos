# Vigía

App web para analizar acciones y recibir alertas, con datos gratuitos de Yahoo Finance (sin clave, con retraso)
y del Banco Mundial.

## Qué hace

- **Mercado**: índices principales y tu lista de seguimiento.
- **Oportunidades**: revisa sola cientos de valores (IBEX 35, grandes de Europa y EE. UU., más los más activos del día;
  lista en `lib/universe.ts`) y muestra los 10 con mejor nota entre los que cumplen una señal (ruptura, tendencia o
  sobreventa). La nota suma el chequeo de la empresa y su entorno: macro global (S&P 500, VIX, tipos a 10 años),
  país (índice bursátil, PIB, inflación y paro del Banco Mundial) y sector. Incluye el tamaño de posición para tu
  capital y riesgo por operación, el precio en vivo y lo que cabe esperar según el histórico: cada señal se simula en
  todos los valores (stop a 2 ATR, objetivo a 4 ATR, salida a las 40 sesiones) para estimar resultado medio y plazo.
- **Detalle de acción**: gráfico, chequeo automático de fundamentales (ingresos, beneficio, ROE, margen EBITDA,
  deuda, PER, dividendo, técnico…), datos clave, análisis técnico, ingresos anuales, noticias y alertas.
- **Diario**: operaciones simuladas sin dinero real. Se cierran solas al tocar stop u objetivo o a los 56 días, y se
  compara el resultado con el esperado. Limita el riesgo abierto al 6 % del capital y la compra al efectivo libre.
- **Alertas**: avisos de precio y vigilancia automática de los controles del chequeo.

Los criterios del chequeo están en `lib/checks.ts` y las señales en `lib/indicators.ts`.

## Uso

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # pruebas de la lógica
npm run build && npm start
```

## Publicar gratis en Vercel

1. Entra en https://vercel.com con tu cuenta de GitHub.
2. «Add New… → Project», elige el repositorio `Marcos` y pulsa «Deploy» sin cambiar nada.
3. Cada vez que se suba código al repositorio, Vercel vuelve a publicar la app.

La red de Vercel guarda las respuestas (una hora la lista de oportunidades, 30 segundos los precios) para no
repetir peticiones a Yahoo en cada visita.

## Costes

Las ganancias se muestran en euros al cambio actual y descuentan comisión por orden, cambio de divisa e impuestos.
Los valores por defecto (1 €, 0,5 % y 19 %) son genéricos y se editan en Oportunidades.

## Limitaciones

- La lista, las alertas y los avisos se guardan en el navegador (localStorage): no hay cuentas ni sincronización.
- Las alertas se comprueban cada minuto y el chequeo cada 30 minutos **solo mientras la app está abierta** en una pestaña.
- Yahoo Finance no es una API oficial: puede cambiar o limitar las peticiones sin aviso. Algunas empresas no tienen
  todos los datos (por ejemplo, noticias de valores españoles) y esos controles salen como «Sin datos».
- Los datos macro del país son anuales (último año publicado) y el sector se mide con su fondo cotizado de EE. UU.
- Las señales son filtros estadísticos, no recomendaciones de inversión.
