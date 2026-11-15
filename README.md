# Vigía

App web para analizar acciones y recibir alertas, con datos gratuitos de Yahoo Finance (sin clave, con retraso).

## Qué hace

- **Mercado**: índices principales y tu lista de seguimiento.
- **Oportunidades**: revisa sola un universo de 24 valores (IBEX y EE. UU.) y muestra los que cumplen una señal
  (ruptura, tendencia o sobreventa), con su chequeo y el tamaño de posición para tu capital y riesgo por operación.
- **Detalle de acción**: gráfico, chequeo automático de fundamentales (ingresos, beneficio, ROE, margen EBITDA,
  deuda, PER, dividendo, técnico…), datos clave, análisis técnico, ingresos anuales, noticias y alertas.
- **Alertas**: avisos de precio y vigilancia automática de los controles del chequeo.

Los criterios del chequeo están en `lib/checks.ts` y las señales en `lib/indicators.ts`.

## Uso

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # pruebas de la lógica
npm run build && npm start
```

## Limitaciones

- La lista, las alertas y los avisos se guardan en el navegador (localStorage): no hay cuentas ni sincronización.
- Las alertas se comprueban cada minuto y el chequeo cada 30 minutos **solo mientras la app está abierta** en una pestaña.
- Yahoo Finance no es una API oficial: puede cambiar o limitar las peticiones sin aviso. Algunas empresas no tienen
  todos los datos (por ejemplo, noticias de valores españoles) y esos controles salen como «Sin datos».
- Las señales son filtros estadísticos, no recomendaciones de inversión.
