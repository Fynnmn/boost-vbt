## Convenciones de BOOST

Ningún componente necesita un provider ni un wrapper de contexto — no hay theme provider, router ni hooks de contexto en esta librería. `Pantalla` es el único "wrapper" real: fija el lienzo de teléfono (390×844), el fondo hueso, la tipografía y el padding — envolvé cualquier composición de pantalla completa en `<Pantalla>`, pero un componente suelto (`Boton`, `Pildora`, `Tarjeta`, etc.) se usa directo, sin envoltorio.

```jsx
import { Pantalla, Encabezado, Tarjeta, color } from 'boost-design-system';

<Pantalla>
  <Encabezado />
  <Tarjeta alta>...</Tarjeta>
</Pantalla>
```

### El idioma: sin clases CSS, todo por props + tokens en JS

BOOST no tiene hoja de estilos ni clases de utilidad. Cada componente se pinta con `style={{...}}` inline, leyendo constantes de token que también se exportan desde el bundle (`window.BoostDesignSystem.color`, `.texto`, `.radio`, `.sombra`, `.pantalla`, `.vbt`). Para maquetar algo propio (el glue entre componentes de BOOST), importá esas mismas constantes en vez de inventar colores o tamaños:

| Token | Uso |
|---|---|
| `color.fondo` `#F2EFE9` | fondo de pantalla (hueso, nunca negro) |
| `color.texto` `#070707` / `color.textoMedio` / `color.textoSuave` | jerarquía de texto |
| `color.coral` `#EE4526` | **reservado para el dato que decide** — última rep, caída de velocidad, aviso de corte. No usar para adornar iconos o títulos. |
| `color.vidrio` / `vidrioAlto` / `vidrioBorde` | tarjetas de vidrio translúcido |
| `color.linea` / `lineaCorte` / `barra` | divisores y gráfico de barras |
| `texto.dato` (92) → `texto.minima` (11) | escala tipográfica completa, del número gigante a la etiqueta chica |
| `radio.card` (26) / `cardAlta` (28) / `pildora` (999) | radios de esquina |
| `sombra.card` / `boton` / `botonCoral` | sombras compuestas (nunca `box-shadow` suelto) |
| `pantalla` `{ancho:390, alto:844, margen:16, arriba:44}` | dimensiones del lienzo — no dibujar barra de estado propia |
| `vbt.objetivoCorte` (0.5 m/s) | umbral por defecto que separa "seguí" de "cortá" |

Tipografía: `fuente.familia` = `"SF Pro Rounded", "Nunito", -apple-system, system-ui, sans-serif`, con `fontVariantNumeric: 'tabular-nums'` en cualquier bloque que muestre cifras (para que el número no salte de ancho al cambiar).

### Dónde está la verdad

Los tokens no viven en un CSS — son el objeto JS exportado por el bundle (`color`, `fuente`, `texto`, `radio`, `sombra`, `pantalla`, `movimiento`, `vbt`). No hay `tokens/*.css` que leer; usá esos exports directo. `styles.css` en la raíz solo carga la tipografía web (Nunito vía Google Fonts) — no define clases. Cada `<Name>.prompt.md` documenta las props reales de ese componente; para componentes compuestos (`Conectar`, `EnVivo`, `Resumen`) el prompt es la referencia de cómo se combinan las piezas.

### Regla de oro

El coral (`color.coral`) es la única señal de "esto ya cruzó el umbral" — se usa en un solo lugar por pantalla (el dato grande, la métrica de caída, o el aviso de corte), nunca en dos a la vez salvo que ambos midan lo mismo. Todo lo demás es hueso, vidrio, gris.

### Las 30 pantallas y de cuál partir

El grupo `pantallas` trae la app entera, ya compuesta con las piezas de `general`. Antes de armar una pantalla nueva desde cero, partí de la más parecida y cambiá lo que haga falta: `Inicio` (con `Tabs`), `ElegirEjercicio`, `ArmarSerie` (usa `SelectorCarga` y `Zonas`), `ObjetivoCorte`, la serie en vivo en sus estados `SerieEsperando` → `SerieEnCurso` → `EnVivo` (corte) → `SeriePausada` → `Descanso`, y los resultados `Resumen`, `ResumenSesion`, `Historial`, `DetalleSesion`, `PerfilVelocidad`. Cuenta y ajustes: `Cuenta`, `AjustesSensor`, `Voz`, `Plan`, `Ayuda`. Estados de error o vacío: `SensorNoEncontrado`, `SensorDesconectado`, `HistorialVacio`.

Piezas de segundo nivel: `BarraTitulo` (volver o cerrar) reemplaza a `Encabezado` adentro de un flujo; `Tabs` va abajo salvo durante la serie en vivo, donde no hay navegación a propósito; `Campo`, `Interruptor`, `FilaAjuste` y `GrupoAjustes` arman formularios y listas de ajustes; `PerfilCargaVelocidad`, `MiniBarras`, `Arco`, `Bateria` y `Zonas` son los gráficos. `Simulado` va en toda pantalla con datos de ejemplo: el sensor todavía no midió nada real. Las fotos del producto (`Bienvenida`, `Conectar`, `BuscandoSensor`, `Colocacion`) ya vienen embebidas; no hace falta pasar `imagenSensor`.
