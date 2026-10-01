# Notas de sync — BOOST design system

## Por qué el config tiene `componentSrcMap` y `dtsPropsFor` para los 37 componentes

Este repo es JSX puro, sin TypeScript y sin `.d.ts` (ver `package.json`: `"storybook": "echo \"sin storybook...\""`, tampoco hay build de tipos). El converter por defecto:

- Lee el nombre de los componentes desde `.d.ts` exportados → con 0 archivos `.d.ts`, no encontraba nada (`[ZERO_MATCH]`).
- El fuzzy-find de `componentSrcMap` solo matchea `<Name>.tsx` / `<Name>/index.tsx` — no sirve para este repo, donde varios componentes viven agrupados en un mismo archivo (`Iconos.jsx`, `Datos.jsx`, `Controles.jsx`, `Superficies.jsx`).

Por eso `componentSrcMap` pinea cada uno de los 37 nombres a su archivo real, y `dtsPropsFor` tiene el cuerpo de props escrito a mano para cada uno (leídos directo de la firma de cada función en `src/`). Si se agrega un componente nuevo al repo, hay que agregar ambas entradas a mano — el heurístico no lo va a encontrar solo.

Consecuencia de la agrupación por archivo: el heurístico de `group` (basado en el directorio) no encuentra nada útil (`components/` es un nombre genérico) y todos los 37 caen en el grupo `general`. Es cosmético — no bloquea nada — pero si se quiere una agrupación real en el picker de Claude Design habría que mover archivos a subcarpetas por componente, lo cual toca la estructura real del repo (documentada en su propio README) y no se hizo en este sync.

## Por qué hay un `.design-sync/assets/fonts.css` + `cssEntry`

`src/tokens/tokens.js` (`fuente.link`) referencia Nunito vía Google Fonts, pero el repo nunca inyecta ese `<link>` en ningún lado — es solo un string de datos. Sin esto, cada preview (y cada pantalla que arme el agente de diseño con esta librería) cae al fallback del sistema en vez de la tipografía redondeada real. Se creó `.design-sync/assets/fonts.css` con el `@import` del mismo link y se apuntó `cfg.cssEntry` ahí, así queda en el `@import` closure de `styles.css` que sí llega a cada diseño.

**Riesgo de re-sync**: en el sandbox donde se corrió esta captura no había acceso a internet, así que los screenshots de grading muestran el fallback serif del sistema, no Nunito real — es un artefacto del entorno de captura, no del bundle (el `@import` está correctamente resuelto en `styles.css`). El renderizado real en claude.ai/design sí tiene salida a internet y debería cargar Nunito. Si algún día se nota que el picker sigue mostrando la tipografía equivocada, revisar esto primero.

## Resuelto el 17/9/2026: las fotos del producto van embebidas

`Conectar`, `Bienvenida`, `BuscandoSensor` y `Colocacion` usaban un path relativo (`sensor.webp`, `sensor-en-barra.webp`) que no resolvía fuera de la galería del repo: en el preview aislado y en Claude Design quedaba un hueco. Ahora `src/tokens/imagenes.js` exporta las dos fotos como data URI (`imagenSensor`, `imagenSensorEnBarra`) y las pantallas las usan por defecto. El bundle pasó de 140 KB a 310 KB — es el precio de que se vean siempre. La prop `imagenSensor`/`imagenBarra` sigue existiendo para pasar otra imagen.

## Warnings triados como benignos (`[RENDER_THIN]`)

Los 15 iconos (`IconoBarra`, `IconoBarras`, `IconoCaida`, `IconoObjetivo`, `IconoBluetooth`, `IconoReloj`, `IconoAviso`, `IconoMas`, `IconoMenos`, `IconoDetener`, `IconoPausa`, `IconoReiniciar`, `IconoFlecha`, `IconoOnda`, `IconoMas3`) disparan `[RENDER_THIN]` ("mounts have no text and paint nothing") porque son SVGs puros sin texto — el heurístico de "thin" busca texto medible y no lo encuentra. Confirmado visualmente en los contact sheets: los 15 pintan bien (trazo correcto, color del token que corresponde). No es una falla real.

## Re-sync risks

- Si se agrega un componente nuevo a `src/`, hay que agregar su entrada en `componentSrcMap` Y `dtsPropsFor` a mano (ver arriba) — el auto-discovery no lo va a encontrar.
- Si algún día el repo migra a TypeScript real con `.d.ts` generado, hay que **borrar** `dtsPropsFor`/`componentSrcMap` (o dejar que el override quede obsoleto silenciosamente con props que ya no matchean la firma real).
- La verificación visual de las 37 previews se hizo en un sandbox sin acceso real a Google Fonts — si el renderizado en claude.ai/design muestra la tipografía de sistema en vez de Nunito, revisar que `styles.css` siga sirviendo el `@import` (no debería romperse por un rebuild normal, pero un `cssEntry` mal apuntado sí lo rompería).
- `cfg.overrides` tiene `cardMode: "column"` para `Pantalla`, `Conectar`, `EnVivo`, `Resumen` — las 4 pantallas de 390×844 necesitan la card completa, no el grid de multi-columna. Si se agrega una quinta composición de pantalla completa, va a necesitar el mismo override (o va a disparar `[GRID_OVERFLOW]`).


## Corrida del 17/9/2026 — de 37 a 94 componentes

- Se agregaron 57 componentes: 16 iconos, 14 piezas (`Formularios.jsx`: Campo, Interruptor, FilaAjuste, GrupoAjustes, Tabs, Vacio, Simulado; `Graficos.jsx`: PerfilCargaVelocidad, MiniBarras, Arco, Bateria, Zonas; `Superficies.jsx`: BarraTitulo, Pasos) y 27 pantallas nuevas en `src/pantallas/`. Cada uno tiene su entrada en `componentSrcMap` y `dtsPropsFor`, como pide la nota de arriba.
- Las 27 pantallas nuevas llevan `cardMode: "column"` (son composiciones de 390×844). `BarraTitulo` y `Zonas` también, por `[GRID_OVERFLOW]` (stories más anchas que la celda del grid).
- El heurístico de grupo sí funciona por carpeta: todo lo que está en `src/pantallas/` cae en el grupo `pantallas` (30) y el resto en `general` (64). No hace falta `docsMap`.
- Las 57 previews están en `.design-sync/previews/`, escritas a mano con el mismo formato que las 37 anteriores. Las pantallas sin props tienen una sola celda `Default`; las que tienen props que cambian el aspecto (`Calibrando`, `ObjetivoCorte`, `SerieEnCurso`, `Descanso`, `Campo`, `Arco`, `Bateria`...) tienen 2–3.
- Render check: 94/94, `bad` vacío, 0 tarjetas de piso. Los 31 `[RENDER_THIN]` son los 31 iconos (16 nuevos + 15 anteriores): SVG puro sin texto, benigno, confirmado en las hojas de contacto.

## Known render warns

- `[RENDER_THIN]` en los 31 `Icono*` — SVG sin texto; pintan bien.
- Tipografía serif en las capturas de las tarjetas chicas (iconos, `DatoGrande`, `Cifra`, `GrupoAjustes`...) — carrera de carga de Nunito en el headless: la captura se toma antes de que Google Fonts responda. Las pantallas completas del mismo build sí muestran Nunito (`_screenshots/pantallas__*.png`), y `styles.css` sirve el `@import`. No es un problema del bundle.
