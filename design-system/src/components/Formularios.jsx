import React from 'react';
import { color, texto, radio, sombra } from '../tokens/tokens.js';
import { Tarjeta, Disco } from './Superficies.jsx';
import { IconoFlecha } from './Iconos.jsx';

// Campo de texto. En el gimnasio se escribe poco y mal: el campo es alto (56 px),
// la etiqueta vive afuera y el foco se marca con el borde coral, no con un
// rectángulo de color que tape lo escrito.
export function Campo({ etiqueta, valor, marcador, foco = false, tipo = 'texto', icono }) {
  const contenido = tipo === 'clave' && valor ? '•'.repeat(valor.length) : valor;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      {etiqueta ? (
        <div
          style={{
            fontSize: texto.etiqueta,
            fontWeight: 700,
            color: color.textoSuave,
            paddingLeft: 4,
          }}
        >
          {etiqueta}
        </div>
      ) : null}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          height: 56,
          padding: '0 16px',
          borderRadius: radio.fila,
          background: 'rgba(255,255,255,0.8)',
          border: `1px solid ${foco ? color.coralBorde : color.vidrioBorde}`,
          boxShadow: foco
            ? 'inset 0 1px 0 rgba(255,255,255,1), 0 0 0 3px rgba(238,69,38,0.10)'
            : 'inset 0 1px 0 rgba(255,255,255,1)',
          boxSizing: 'border-box',
        }}
      >
        {icono}
        <span
          style={{
            fontSize: 16,
            fontWeight: contenido ? 700 : 600,
            color: contenido ? color.texto : color.textoSuave,
            letterSpacing: tipo === 'clave' && contenido ? '0.18em' : 'normal',
          }}
        >
          {contenido || marcador}
        </span>
        {foco ? (
          <span
            style={{
              width: 2,
              height: 22,
              background: color.coral,
              marginLeft: -6,
              borderRadius: 1,
            }}
          />
        ) : null}
      </div>
    </div>
  );
}

// Interruptor. Coral cuando está encendido; es el único lugar fuera de los datos
// donde el coral aparece, y se justifica porque comunica un estado activo.
export function Interruptor({ encendido = false }) {
  return (
    <div
      style={{
        width: 52,
        height: 32,
        borderRadius: 999,
        flex: 'none',
        padding: 3,
        display: 'flex',
        justifyContent: encendido ? 'flex-end' : 'flex-start',
        background: encendido ? color.coral : 'rgba(7,7,7,0.14)',
        boxShadow: 'inset 0 1px 3px rgba(7,7,7,0.12)',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          width: 26,
          height: 26,
          borderRadius: '50%',
          background: '#fff',
          boxShadow: '0 2px 6px rgba(7,7,7,0.25)',
        }}
      />
    </div>
  );
}

// Fila de ajuste: etiqueta, detalle y un control a la derecha (interruptor,
// valor, flecha). Todas las listas de ajustes se arman con esto.
export function FilaAjuste({ titulo, detalle, derecha, icono, ultima = false }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '13px 2px',
        borderBottom: ultima ? 'none' : `1px solid ${color.linea}`,
      }}
    >
      {icono ? (
        <Disco tam={36} fondo="rgba(7,7,7,0.05)" sombraPropia="none">
          {icono}
        </Disco>
      ) : null}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em' }}>{titulo}</div>
        {detalle ? (
          <div
            style={{
              fontSize: texto.etiqueta,
              fontWeight: 600,
              color: color.textoSuave,
              lineHeight: 1.3,
              textWrap: 'pretty',
            }}
          >
            {detalle}
          </div>
        ) : null}
      </div>
      {derecha ?? <IconoFlecha />}
    </div>
  );
}

// Grupo de ajustes en una tarjeta, con título afuera.
export function GrupoAjustes({ titulo, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 'none' }}>
      {titulo ? (
        <div
          style={{
            fontSize: texto.minima,
            fontWeight: 800,
            color: color.textoSuave,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            paddingLeft: 6,
          }}
        >
          {titulo}
        </div>
      ) : null}
      <Tarjeta padding="2px 16px" gap={0}>
        {children}
      </Tarjeta>
    </div>
  );
}

// Barra de navegación inferior. Ausente durante la serie en vivo a propósito:
// ahí no hay nada más que hacer que la serie.
export function Tabs({ activa = 'entrenar' }) {
  const items = [
    { id: 'entrenar', nombre: 'Entrenar', icono: IconoTabEntrenar },
    { id: 'historial', nombre: 'Historial', icono: IconoTabHistorial },
    { id: 'perfil', nombre: 'Perfil', icono: IconoTabPerfil },
    { id: 'cuenta', nombre: 'Cuenta', icono: IconoTabCuenta },
  ];
  return (
    <div
      style={{
        position: 'relative',
        display: 'grid',
        gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
        padding: '10px 6px 4px',
        borderRadius: 26,
        background: 'rgba(255,255,255,0.72)',
        border: `1px solid ${color.vidrioBordeAlto}`,
        boxShadow: sombra.cardAlta,
        marginTop: 'auto',
        flex: 'none',
        boxSizing: 'border-box',
      }}
    >
      {items.map((it) => {
        const on = it.id === activa;
        const Icono = it.icono;
        return (
          <div
            key={it.id}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 5,
              padding: '4px 0 8px',
            }}
          >
            <Icono c={on ? color.coral : color.textoSuave} />
            <span
              style={{
                fontSize: 10,
                fontWeight: on ? 800 : 600,
                color: on ? color.texto : color.textoSuave,
              }}
            >
              {it.nombre}
            </span>
          </div>
        );
      })}
    </div>
  );
}

const trazo = (c) => ({
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: c,
  strokeWidth: 2.1,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
});

function IconoTabEntrenar({ c }) {
  return (
    <svg {...trazo(c)}>
      <path d="M8 12h8" />
      <rect x="5" y="8" width="3" height="8" rx="1" />
      <rect x="16" y="8" width="3" height="8" rx="1" />
    </svg>
  );
}
function IconoTabHistorial({ c }) {
  return (
    <svg {...trazo(c)}>
      <rect x="4" y="5" width="16" height="15" rx="3" />
      <path d="M4 10h16M9 3v4M15 3v4" />
    </svg>
  );
}
function IconoTabPerfil({ c }) {
  return (
    <svg {...trazo(c)}>
      <path d="M4 19V5" />
      <path d="M4 19h16" />
      <path d="M8 16l4-6 3 3 4-6" />
    </svg>
  );
}
function IconoTabCuenta({ c }) {
  return (
    <svg {...trazo(c)}>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </svg>
  );
}

// Estado vacío. Nunca una pantalla en blanco: dice qué falta y cuál es el paso.
export function Vacio({ titulo, detalle, icono, accion }) {
  return (
    <Tarjeta alta padding="34px 24px" gap={10} estilo={{ alignItems: 'center' }}>
      <Disco tam={72} fondo="rgba(7,7,7,0.04)" sombraPropia="none">
        {icono}
      </Disco>
      <div
        style={{
          fontSize: texto.tituloCard,
          fontWeight: 800,
          letterSpacing: '-0.02em',
          textAlign: 'center',
          marginTop: 4,
        }}
      >
        {titulo}
      </div>
      <div
        style={{
          fontSize: texto.chico,
          fontWeight: 600,
          color: color.textoSuave,
          textAlign: 'center',
          lineHeight: 1.4,
          textWrap: 'pretty',
          maxWidth: 260,
        }}
      >
        {detalle}
      </div>
      {accion}
    </Tarjeta>
  );
}

// Aviso de simulación. Va en toda pantalla que muestre datos que no salieron de
// una medición real. No es decorativo: el aparato no existe hasta el 6/10/2026.
export function Simulado() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 7,
        padding: '7px 12px',
        borderRadius: 999,
        background: 'rgba(7,7,7,0.05)',
        fontSize: 10,
        fontWeight: 700,
        color: color.textoSuave,
        letterSpacing: '0.02em',
        flex: 'none',
      }}
    >
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: color.textoSuave }} />
      Simulación · no son mediciones
    </div>
  );
}
