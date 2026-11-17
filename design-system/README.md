# BOOST — sistema de diseño

Biblioteca de componentes de la app BOOST. Existe para que el agente de
Claude Design arme pantallas nuevas con **estos** componentes en vez de
inventar unos parecidos, y para que el día que la app se escriba nativa
haya una fuente única del sistema visual.

## Qué hay adentro

```
src/
  tokens/tokens.js        colores, tipografía, escalas, radios, sombras, umbral VBT
  components/
    Superficies.jsx       Pantalla, Tarjeta, Encabezado, BarraTitulo, Disco, Pasos
    Iconos.jsx            los 30 iconos de trazo, grilla de 24
    Datos.jsx             DatoGrande, Cifra, FilaCifras, Aviso, Metrica,
                          GraficoReps, TituloGrafico
    Controles.jsx         BotonDisco, ControlesSerie, Boton, Pildora,
                          PildoraVidrio, CabeceraEjercicio, Fila, SelectorCarga
    Formularios.jsx       Campo, Interruptor, FilaAjuste, GrupoAjustes, Tabs,
                          Vacio, Simulado
    Graficos.jsx          PerfilCargaVelocidad, MiniBarras, Arco, Bateria, Zonas
  pantallas/              las 30 pantallas, compuestas con lo de arriba
  galeria.jsx             vista de trabajo: todas juntas, agrupadas por momento
```

## Las 30 pantallas

**Entrar** — Bienvenida · CrearCuenta · IniciarSesion · PermisoBluetooth

**Poner el sensor** — BuscandoSensor · SensorNoEncontrado · Conectar ·
Colocacion · Calibrando

**Antes de levantar** — Inicio · ElegirEjercicio · ArmarSerie · ObjetivoCorte

**La serie** — SerieEsperando · SerieEnCurso · EnVivo (el estado de corte) ·
SeriePausada · Descanso

**Resultados** — Resumen (de serie) · ResumenSesion · Historial ·
DetalleSesion · PerfilVelocidad · HistorialVacio

**Cuenta y ajustes** — Cuenta · AjustesSensor · Voz · Plan · Ayuda

**Cuando algo falla** — SensorDesconectado

Todas miden 390 × 844 y ninguna se desborda; está verificado en el navegador,
no a ojo.

## Comandos

```bash
npm install            # una vez
npm run dev            # galería en http://localhost:5177
npm run build          # dist/boost-design-system.js
```

En este repo el servidor también está registrado como `boost-design-system`
en `.claude/launch.json` de la raíz.

## Las reglas del sistema

**El coral se reserva para el dato que decide.** La velocidad de la última
repetición, la caída, el aviso de corte. Si se usa para adornar un icono o un
título, deja de significar algo y la pantalla ya no se puede leer de un vistazo.

**El fondo es hueso, no negro.** La app en producción (`app/css/app.css`) es
oscura; esta dirección viene de `referencia-boost.png` y va al revés: hueso
`#F2EFE9`, tarjetas de vidrio blanco translúcido, luz de 1 px en el borde
superior y sombra suave hacia abajo. La profundidad la dan las capas, no un
degradado de fondo.

**No se dibuja el cromo del teléfono.** Ni barra de estado ni teclado: en el
aparato real los pone iOS encima y un calco se ve doblado. Por eso `Pantalla`
deja 44 px arriba y nada más.

**Los controles de la serie son discos grandes con la etiqueta afuera.** Con
las manos mojadas y sin mirar, un disco de 60–96 px falla menos que un botón
con texto adentro. La geometría no cambia entre estados: el pulgar no tiene
que buscar.

**El número no se mueve.** Cifras tabulares y unidad aparte, en línea de base,
para que pasar de 0,42 a 1,05 no desplace nada.

## Lo que estos componentes no afirman

Los valores por defecto (0,78 → 0,42 m/s, −46 %, batería 87 %) son **ejemplos
para ver el diseño**, no mediciones. El sensor recién llega el 6/10/2026 y la
prueba que decide el proyecto —95 % de precisión contra conteo por video— no se
hizo. Cualquier pantalla que se arme con esta biblioteca y se muestre afuera
tiene que decirlo.

El texto tampoco promete que no hay configuración: el sensor **sí** se calibra
y **sí** hay que apretar "Comenzar serie". Está documentado en `ESTADO.md` como
un dato que ya se escribió mal dos veces.

## Subirlas a Claude Design

El proyecto es **BOOST** en claude.ai/design:
https://claude.ai/design/p/b0484660-9c88-47b5-8f1f-e7797dc58900

Después de tocar este repo hay que volver a sincronizar. El comando lo tiene
que tipear Máximo, no lo puede invocar Claude:

```
/design-sync Colegio/BOOST/design-system
```

Antes de una re-sincronización conviene leer `.design-sync/NOTES.md` (gaps
conocidos de la corrida anterior) y `.design-sync/conventions.md`.

## Relación con el resto del proyecto

- `app/` es la PWA en producción (`app.getboost.fit`), oscura. Esta biblioteca
  todavía no la reemplaza: es la dirección nueva, a aprobar.
- `app/design/` tiene el canvas de agosto con la dirección oscura anterior.
- `app/design/claude-design/` tiene las tres pantallas estáticas de las que
  salieron estos componentes.
