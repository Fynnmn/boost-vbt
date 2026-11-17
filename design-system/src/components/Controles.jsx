import React from 'react';
import { color, texto, radio, sombra } from '../tokens/tokens.js';
import { Tarjeta, Disco } from './Superficies.jsx';
import { IconoBarra, IconoFlecha } from './Iconos.jsx';

// Botón circular de vidrio con la etiqueta afuera. Es el control de la serie en
// vivo: con las manos mojadas y sin mirar mucho, un disco grande y separado
// falla menos que un botón rectangular con texto adentro. 60 px el secundario,
// 96 el principal; los dos por encima del mínimo de 44 de toque.
export function BotonDisco({ icono, etiqueta, principal = false }) {
  const tam = principal ? 96 : 60;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <div
        style={{
          width: tam,
          height: tam,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: principal
            ? 'linear-gradient(180deg, rgba(255,255,255,1), rgba(255,255,255,0.72))'
            : 'linear-gradient(180deg, rgba(255,255,255,0.98), rgba(255,255,255,0.7))',
          border: '1px solid rgba(255,255,255,1)',
          boxShadow: principal ? sombra.botonPrincipal : sombra.boton,
        }}
      >
        {icono}
      </div>
      <div style={{ fontSize: texto.chico, fontWeight: 600, color: color.textoMedio }}>
        {etiqueta}
      </div>
    </div>
  );
}

// Barra de controles de la serie: secundario, principal, secundario. Se mantiene
// esta geometría en todos los estados (en curso, en pausa) para que el pulgar no
// tenga que buscar el botón entre repeticiones.
export function ControlesSerie({ izquierda, centro, derecha }) {
  return (
    <div
      style={{
        position: 'relative',
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        alignItems: 'end',
        marginTop: 'auto',
        flex: 'none',
      }}
    >
      {izquierda}
      {centro}
      {derecha}
    </div>
  );
}

// Botón ancho. `coral` es la acción principal de la pantalla: una sola por
// pantalla, siempre la misma altura de 58 px.
export function Boton({ children, coral = false }) {
  return (
    <div
      style={{
        width: '100%',
        height: 58,
        borderRadius: radio.pildora,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: coral
          ? `linear-gradient(180deg, ${color.coralClaro}, ${color.coral})`
          : 'linear-gradient(180deg, rgba(255,255,255,0.98), rgba(255,255,255,0.7))',
        border: coral ? 'none' : '1px solid rgba(255,255,255,1)',
        color: coral ? '#fff' : color.texto,
        fontSize: texto.cuerpoFuerte,
        fontWeight: 800,
        letterSpacing: '-0.01em',
        boxShadow: coral ? sombra.botonCoral : sombra.boton,
        boxSizing: 'border-box',
      }}
    >
      {children}
    </div>
  );
}

// Píldora de estado o de filtro. `viva` es el punto coral que late mientras la
// serie corre.
export function Pildora({ children, viva = false, tenue = false }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        height: 30,
        padding: '0 12px',
        borderRadius: radio.pildora,
        background: viva || tenue ? color.coralTenueAlto : 'rgba(255,255,255,0.6)',
        border: viva || tenue ? 'none' : `1px solid ${color.vidrioBorde}`,
        flex: 'none',
        fontSize: texto.etiqueta,
        fontWeight: 700,
        color: color.texto,
        boxSizing: 'border-box',
      }}
    >
      {viva ? (
        <span
          style={{ width: 7, height: 7, borderRadius: '50%', background: color.coral, flex: 'none' }}
        />
      ) : null}
      {children}
    </div>
  );
}

// Píldora de vidrio para el encabezado: cronómetro de descanso, batería, menú.
export function PildoraVidrio({ children, alto = 40 }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        height: alto,
        padding: '0 14px',
        borderRadius: radio.pildora,
        background: 'linear-gradient(180deg, rgba(255,255,255,0.95), rgba(255,255,255,0.65))',
        border: '1px solid rgba(255,255,255,0.9)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,1), 0 6px 16px -8px rgba(7,7,7,0.25)',
        fontSize: texto.chico,
        fontWeight: 700,
        boxSizing: 'border-box',
      }}
    >
      {children}
    </div>
  );
}

// Encabezado de ejercicio: icono, nombre, subtítulo y estado a la derecha.
// Se repite en la serie en vivo, en el resumen y en cada fila del historial, así
// que vive en un solo componente.
export function CabeceraEjercicio({ nombre, detalle, derecha, icono }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <Disco tam={54}>{icono ?? <IconoBarra />}</Disco>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: texto.tituloCard,
            fontWeight: 800,
            letterSpacing: '-0.02em',
            lineHeight: 1.15,
          }}
        >
          {nombre}
        </div>
        {detalle ? (
          <div style={{ fontSize: texto.chico, fontWeight: 600, color: color.textoSuave }}>
            {detalle}
          </div>
        ) : null}
      </div>
      {derecha}
    </div>
  );
}

// Fila de lista con flecha: sensores encontrados, ejercicios, series del
// historial. `activa` la destaca con el borde coral sin llenarla de color.
export function Fila({ icono, titulo, detalle, derecha, activa = false }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '12px 14px',
        borderRadius: radio.fila,
        background: activa ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.55)',
        border: `1px solid ${activa ? color.coralBorde : color.vidrioBorde}`,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,1)',
        boxSizing: 'border-box',
      }}
    >
      {icono ? (
        <Disco tam={44} fondo={activa ? color.coralTenue : 'rgba(7,7,7,0.05)'} sombraPropia="none">
          {icono}
        </Disco>
      ) : null}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.01em' }}>{titulo}</div>
        {detalle ? (
          <div style={{ fontSize: texto.etiqueta, fontWeight: 600, color: color.textoSuave }}>
            {detalle}
          </div>
        ) : null}
      </div>
      {derecha ?? <IconoFlecha />}
    </div>
  );
}

// Selector de carga. Reemplaza a la rueda: con las manos mojadas, ±2,5 kg y la
// entrada directa fallan menos que un control que pide precisión.
export function SelectorCarga({ valor = 100, paso = 2.5, unidad = 'kg' }) {
  const fmt = (n) => String(n).replace('.', ',');
  return (
    <Tarjeta padding="16px 18px" gap={14}>
      <div style={{ fontSize: texto.chico, fontWeight: 800 }}>Carga</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Disco
          tam={64}
          fondo="linear-gradient(180deg, rgba(255,255,255,0.98), rgba(255,255,255,0.7))"
          sombraPropia={sombra.boton}
        >
          <span style={{ fontSize: 20, fontWeight: 800 }}>−</span>
        </Disco>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
          <span style={{ fontSize: 52, fontWeight: 900, letterSpacing: '-0.05em', lineHeight: 1 }}>
            {fmt(valor)}
          </span>
          <span style={{ fontSize: 18, fontWeight: 600, color: color.textoSuave }}>{unidad}</span>
        </div>
        <Disco
          tam={64}
          fondo="linear-gradient(180deg, rgba(255,255,255,0.98), rgba(255,255,255,0.7))"
          sombraPropia={sombra.boton}
        >
          <span style={{ fontSize: 20, fontWeight: 800 }}>+</span>
        </Disco>
      </div>
      <div
        style={{
          fontSize: texto.minima,
          fontWeight: 600,
          color: color.textoSuave,
          textAlign: 'center',
        }}
      >
        Pasos de {fmt(paso)} {unidad} · tocá el número para escribirlo
      </div>
    </Tarjeta>
  );
}
