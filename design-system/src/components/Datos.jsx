import React from 'react';
import { color, texto, radio, vbt } from '../tokens/tokens.js';
import { Tarjeta, Disco } from './Superficies.jsx';
import { IconoBarras } from './Iconos.jsx';

// Dato grande. Es el componente central del sistema: la velocidad de la última
// repetición. `alerta` lo pinta de coral, que es lo único que dice "esto ya está
// por debajo de tu objetivo". Las unidades quedan secundarias y en línea de base
// para que el número no se mueva al cambiar de 0,42 a 1,05.
export function DatoGrande({ valor, unidad = 'm/s', tam = texto.dato, alerta = false }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
      <span
        style={{
          fontSize: tam,
          fontWeight: 900,
          letterSpacing: '-0.06em',
          lineHeight: 0.95,
          color: alerta ? color.coral : color.texto,
        }}
      >
        {valor}
      </span>
      {unidad ? (
        <span style={{ fontSize: Math.round(tam * 0.22), fontWeight: 600, color: color.textoSuave }}>
          {unidad}
        </span>
      ) : null}
    </div>
  );
}

// Cifra con etiqueta arriba y sufijo opcional: "Serie 3 / 4", "Carga 100 kg".
export function Cifra({ etiqueta, valor, sufijo, tam = texto.cifra }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <div style={{ fontSize: texto.etiqueta, fontWeight: 600, color: color.textoSuave }}>
        {etiqueta}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
        <span style={{ fontSize: tam, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1 }}>
          {valor}
        </span>
        {sufijo ? (
          <span style={{ fontSize: 15, fontWeight: 600, color: color.textoSuave }}>{sufijo}</span>
        ) : null}
      </div>
    </div>
  );
}

// Fila de cifras separadas por líneas finas. Tres es el máximo legible a esta
// altura de pantalla; con cuatro las cifras empiezan a competir entre sí.
export function FilaCifras({ items }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`,
        gap: 0,
      }}
    >
      {items.map((it, i) => (
        <div
          key={it.etiqueta}
          style={{
            padding: i === 0 ? '0 8px 0 4px' : '0 8px 0 14px',
            borderLeft: i === 0 ? 'none' : `1px solid ${color.linea}`,
          }}
        >
          <Cifra {...it} />
        </div>
      ))}
    </div>
  );
}

// Aviso de estado. El de corte es el único mensaje de la app que tiene derecho
// al coral de fondo: es la decisión que el sensor existe para tomar.
export function Aviso({ titulo, detalle, icono, tono = 'corte' }) {
  const fondo = tono === 'corte' ? color.coralTenue : 'rgba(7,7,7,0.05)';
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        width: '100%',
        padding: '12px 14px',
        borderRadius: radio.interior,
        background: fondo,
        boxSizing: 'border-box',
      }}
    >
      <Disco
        tam={44}
        fondo="rgba(255,255,255,0.75)"
        sombraPropia="inset 0 1px 0 rgba(255,255,255,1)"
      >
        {icono ?? <IconoBarras />}
      </Disco>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ fontSize: texto.cuerpoFuerte, fontWeight: 800, letterSpacing: '-0.01em' }}>
          {titulo}
        </div>
        {detalle ? (
          <div
            style={{
              fontSize: texto.chico,
              fontWeight: 600,
              color: color.textoMedio,
              lineHeight: 1.3,
              textWrap: 'pretty',
            }}
          >
            {detalle}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// Métrica chica en tarjeta: caída de velocidad, objetivo de corte, 1RM estimado.
export function Metrica({ etiqueta, valor, unidad, pie, icono, tono = 'neutro' }) {
  return (
    <Tarjeta padding="10px 12px" gap={0} estilo={{ flexDirection: 'row', alignItems: 'center' }}>
      <Disco
        tam={34}
        fondo={tono === 'alerta' ? color.coralTenue : 'rgba(7,7,7,0.06)'}
        sombraPropia="none"
      >
        {icono}
      </Disco>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0, marginLeft: 10 }}>
        <div
          style={{
            fontSize: texto.minima,
            fontWeight: 600,
            color: color.textoSuave,
            whiteSpace: 'nowrap',
            letterSpacing: '-0.01em',
          }}
        >
          {etiqueta}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
          <span
            style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.1 }}
          >
            {valor}
          </span>
          {unidad ? (
            <span style={{ fontSize: texto.etiqueta, fontWeight: 600, color: color.textoSuave }}>
              {unidad}
            </span>
          ) : null}
        </div>
        {pie ? (
          <div style={{ fontSize: 10, fontWeight: 600, color: color.textoSuave }}>{pie}</div>
        ) : null}
      </div>
    </Tarjeta>
  );
}

// Gráfico de velocidad por repetición, con la línea del objetivo de corte.
// Las barras por debajo del objetivo se pintan de coral: es la misma regla que
// el número grande, aplicada a la serie entera. La escala sale de la mejor rep,
// así que la primera barra siempre llega arriba y la caída se lee como forma.
export function GraficoReps({
  velocidades,
  objetivo = vbt.objetivoCorte,
  alto = 74,
  conValores = true,
}) {
  const mejor = Math.max(...velocidades, objetivo);
  const pieEtiqueta = 14;
  const utilizable = alto - pieEtiqueta - (conValores ? 16 : 0);
  const altoBarra = (v) => Math.max(8, Math.round((v / mejor) * utilizable));
  const fmt = (v) => v.toFixed(2).replace('.', ',');

  return (
    <div style={{ position: 'relative', height: alto }}>
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: pieEtiqueta + altoBarra(objetivo),
          borderTop: `2px dashed ${color.lineaCorte}`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'grid',
          gridTemplateColumns: `repeat(${velocidades.length}, minmax(0, 1fr))`,
          gap: 10,
          alignItems: 'end',
        }}
      >
        {velocidades.map((v, i) => {
          const bajo = v < objetivo;
          return (
            <div
              key={i}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}
            >
              {conValores ? (
                <span
                  style={{
                    fontSize: texto.minima,
                    fontWeight: bajo ? 800 : 700,
                    color: bajo ? color.coral : color.textoMedio,
                  }}
                >
                  {fmt(v)}
                </span>
              ) : null}
              <div
                style={{
                  width: '100%',
                  height: altoBarra(v),
                  borderRadius: '6px 6px 0 0',
                  background: bajo ? color.coral : color.barra,
                }}
              />
              <span style={{ fontSize: 10, fontWeight: 600, color: color.textoSuave }}>
                {i + 1}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Encabezado de gráfico con la leyenda del objetivo.
export function TituloGrafico({ titulo, objetivo = vbt.objetivoCorte }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ fontSize: texto.chico, fontWeight: 800 }}>{titulo}</div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: texto.minima,
          fontWeight: 600,
          color: color.textoSuave,
        }}
      >
        <span style={{ width: 18, borderTop: '2px dashed #B8B4AC' }} />
        Objetivo de corte {objetivo.toFixed(2).replace('.', ',')} m/s
      </div>
    </div>
  );
}
