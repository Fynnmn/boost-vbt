import React from 'react';
import { color, radio, sombra, fuente, pantalla } from '../tokens/tokens.js';

// Pantalla. Envuelve cualquier composición: fija el lienzo de 390 × 844, el
// fondo hueso y las dos luces que le dan profundidad sin recurrir a un
// degradado de fondo. No dibuja barra de estado ni teclado: en el teléfono real
// los pone el sistema encima y un calco se ve doble.
export function Pantalla({ children, gap = 10, abajo = 24 }) {
  return (
    <div
      style={{
        width: pantalla.ancho,
        height: pantalla.alto,
        position: 'relative',
        overflow: 'hidden',
        background: color.fondo,
        color: color.texto,
        fontFamily: fuente.familia,
        fontVariantNumeric: 'tabular-nums',
        WebkitFontSmoothing: 'antialiased',
        display: 'flex',
        flexDirection: 'column',
        padding: `${pantalla.arriba}px ${pantalla.margen}px ${abajo}px`,
        gap,
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: -140,
          left: -80,
          width: 420,
          height: 420,
          borderRadius: '50%',
          background:
            'radial-gradient(circle, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0) 65%)',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: -120,
          right: -100,
          width: 380,
          height: 380,
          borderRadius: '50%',
          background:
            'radial-gradient(circle, rgba(238,69,38,0.10) 0%, rgba(238,69,38,0) 65%)',
          pointerEvents: 'none',
        }}
      />
      {children}
    </div>
  );
}

// Tarjeta de vidrio. `alta` sube la opacidad y la sombra: se usa para el bloque
// que manda en la pantalla (la última rep, la caída de velocidad), de manera que
// la jerarquía se lea por profundidad y no solo por tamaño de letra.
export function Tarjeta({ children, alta = false, padding = '14px 18px', gap = 12, estilo }) {
  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        gap,
        padding,
        borderRadius: alta ? radio.cardAlta : radio.card,
        background: alta ? color.vidrioAlto : color.vidrio,
        border: `1px solid ${alta ? color.vidrioBordeAlto : color.vidrioBorde}`,
        boxShadow: alta ? sombra.cardAlta : sombra.card,
        flex: 'none',
        boxSizing: 'border-box',
        ...estilo,
      }}
    >
      {children}
    </div>
  );
}

// Encabezado. El wordmark con el punto coral queda fijo a la izquierda; a la
// derecha entra una acción o un estado (el cronómetro de descanso, por ejemplo).
export function Encabezado({ derecha }) {
  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: 44,
        padding: '0 4px',
        flex: 'none',
      }}
    >
      <div style={{ fontSize: 27, fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1 }}>
        BOOST<span style={{ color: color.coralLogo }}>.</span>
      </div>
      {derecha}
    </div>
  );
}

// Disco de vidrio: la base de los botones circulares y de los huecos de icono.
export function Disco({ children, tam = 44, fondo, sombraPropia, borde }) {
  return (
    <div
      style={{
        width: tam,
        height: tam,
        borderRadius: '50%',
        flex: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: fondo ?? `linear-gradient(180deg, ${color.hueco}, ${color.huecoFondo})`,
        border: borde,
        boxShadow: sombraPropia ?? 'inset 0 1px 0 rgba(255,255,255,0.9)',
      }}
    >
      {children}
    </div>
  );
}

// Barra de título con botón de volver. Las pantallas de segundo nivel (ajustes,
// detalle de una sesión) la usan en lugar del wordmark: adentro de un flujo
// importa más de dónde venís que la marca.
export function BarraTitulo({ titulo, derecha, cerrar = false }) {
  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        height: 44,
        flex: 'none',
      }}
    >
      <Disco
        tam={40}
        fondo="linear-gradient(180deg, rgba(255,255,255,0.95), rgba(255,255,255,0.65))"
        borde="1px solid rgba(255,255,255,0.9)"
        sombraPropia="inset 0 1px 0 rgba(255,255,255,1), 0 6px 16px -8px rgba(7,7,7,0.25)"
      >
        {cerrar ? <IconoCerrarInterno /> : <IconoVolverInterno />}
      </Disco>
      <div
        style={{
          fontSize: 19,
          fontWeight: 800,
          letterSpacing: '-0.02em',
          flex: 1,
          minWidth: 0,
        }}
      >
        {titulo}
      </div>
      {derecha}
    </div>
  );
}

function IconoVolverInterno() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#070707" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}

function IconoCerrarInterno() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#070707" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 7l10 10M17 7L7 17" />
    </svg>
  );
}

// Paso de un flujo: "2 de 4" con puntos. Se usa en la puesta en marcha para que
// se vea cuánto falta antes de empezar a levantar.
export function Pasos({ actual = 1, total = 4 }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 'none' }}>
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          style={{
            width: i + 1 === actual ? 22 : 7,
            height: 7,
            borderRadius: 999,
            background: i + 1 <= actual ? '#EE4526' : 'rgba(7,7,7,0.14)',
          }}
        />
      ))}
    </div>
  );
}
