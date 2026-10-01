import React from 'react';
import { color, texto } from '../tokens/tokens.js';

// Perfil carga-velocidad. Cada punto es una serie: carga contra la velocidad de
// la mejor repetición. La recta es la regresión, y el 1RM estimado es el punto
// donde esa recta cruza los 0,15 m/s (velocidad mínima de una repetición máxima
// en press de banca).
//
// Regla que no se negocia: el 1RM nunca se muestra solo. Va siempre con r², con
// la cantidad de series y con el rango de cargas, porque una recta trazada sobre
// tres puntos juntos puede dar cualquier número y parecer precisa.
export function PerfilCargaVelocidad({
  puntos = [
    { carga: 60, v: 0.92 },
    { carga: 70, v: 0.81 },
    { carga: 80, v: 0.7 },
    { carga: 90, v: 0.58 },
    { carga: 100, v: 0.47 },
  ],
  alto = 170,
  ancho = 322,
}) {
  const margen = { izq: 30, der: 8, arriba: 10, abajo: 22 };
  const cargas = puntos.map((p) => p.carga);
  const minC = Math.min(...cargas) - 8;
  const maxC = Math.max(...cargas) + 18;
  const maxV = 1.1;

  const x = (c) =>
    margen.izq + ((c - minC) / (maxC - minC)) * (ancho - margen.izq - margen.der);
  const y = (v) => margen.arriba + (1 - v / maxV) * (alto - margen.arriba - margen.abajo);

  // Mínimos cuadrados sobre los puntos reales.
  const n = puntos.length;
  const sx = cargas.reduce((a, b) => a + b, 0);
  const sy = puntos.reduce((a, p) => a + p.v, 0);
  const sxy = puntos.reduce((a, p) => a + p.carga * p.v, 0);
  const sxx = puntos.reduce((a, p) => a + p.carga * p.carga, 0);
  const pend = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  const ord = (sy - pend * sx) / n;
  const en = (c) => pend * c + ord;

  return (
    <svg width={ancho} height={alto} style={{ display: 'block', overflow: 'visible' }}>
      {[0.25, 0.5, 0.75, 1.0].map((v) => (
        <g key={v}>
          <line
            x1={margen.izq}
            x2={ancho - margen.der}
            y1={y(v)}
            y2={y(v)}
            stroke={color.linea}
            strokeWidth="1"
          />
          <text
            x={margen.izq - 7}
            y={y(v) + 3.5}
            textAnchor="end"
            fontSize="9"
            fontWeight="600"
            fill={color.textoSuave}
          >
            {v.toFixed(2).replace('.', ',')}
          </text>
        </g>
      ))}

      <line
        x1={x(minC)}
        y1={y(en(minC))}
        x2={x(maxC)}
        y2={y(en(maxC))}
        stroke={color.coral}
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity="0.9"
      />

      {puntos.map((p) => (
        <g key={p.carga}>
          <circle cx={x(p.carga)} cy={y(p.v)} r="6.5" fill="#fff" />
          <circle cx={x(p.carga)} cy={y(p.v)} r="4.5" fill={color.texto} />
          <text
            x={x(p.carga)}
            y={alto - 6}
            textAnchor="middle"
            fontSize="9"
            fontWeight="600"
            fill={color.textoSuave}
          >
            {p.carga}
          </text>
        </g>
      ))}
    </svg>
  );
}

// Barras compactas de una sesión pasada, para el historial. Sin ejes ni valores:
// acá la forma alcanza — se ve de un vistazo si la sesión se sostuvo o se cayó.
export function MiniBarras({ velocidades, objetivo = 0.5, alto = 30, gap = 3 }) {
  const mejor = Math.max(...velocidades, objetivo);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap, height: alto }}>
      {velocidades.map((v, i) => (
        <div
          key={i}
          style={{
            width: 6,
            height: Math.max(4, Math.round((v / mejor) * alto)),
            borderRadius: '2px 2px 0 0',
            background: v < objetivo ? color.coral : color.barra,
          }}
        />
      ))}
    </div>
  );
}

// Arco de calibración. El progreso se lee como un arco continuo y no como una
// barra, para que no se confunda con el gráfico de repeticiones.
export function Arco({ progreso = 0.62, tam = 168, grosor = 12, etiqueta, valor }) {
  const r = (tam - grosor) / 2;
  const c = 2 * Math.PI * r;
  const visible = 0.75; // arco de 270°, abierto abajo
  return (
    <div style={{ position: 'relative', width: tam, height: tam }}>
      <svg width={tam} height={tam} style={{ transform: 'rotate(135deg)' }}>
        <circle
          cx={tam / 2}
          cy={tam / 2}
          r={r}
          fill="none"
          stroke="rgba(7,7,7,0.07)"
          strokeWidth={grosor}
          strokeLinecap="round"
          strokeDasharray={`${c * visible} ${c}`}
        />
        <circle
          cx={tam / 2}
          cy={tam / 2}
          r={r}
          fill="none"
          stroke={color.coral}
          strokeWidth={grosor}
          strokeLinecap="round"
          strokeDasharray={`${c * visible * progreso} ${c}`}
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
        }}
      >
        <div style={{ fontSize: 40, fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1 }}>
          {valor}
        </div>
        <div style={{ fontSize: texto.etiqueta, fontWeight: 600, color: color.textoSuave }}>
          {etiqueta}
        </div>
      </div>
    </div>
  );
}

// Medidor de batería del sensor. Coral solo cuando queda poca: si siempre fuera
// de color, el color dejaría de avisar.
export function Bateria({ nivel = 87, ancho = 34 }) {
  const bajo = nivel <= 20;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div
        style={{
          position: 'relative',
          width: ancho,
          height: 16,
          borderRadius: 5,
          border: `1.8px solid ${bajo ? color.coral : 'rgba(7,7,7,0.35)'}`,
          padding: 2,
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            width: `${Math.max(6, nivel)}%`,
            height: '100%',
            borderRadius: 2,
            background: bajo ? color.coral : color.texto,
          }}
        />
        <div
          style={{
            position: 'absolute',
            right: -4,
            top: 4,
            width: 2.5,
            height: 6,
            borderRadius: 1,
            background: bajo ? color.coral : 'rgba(7,7,7,0.35)',
          }}
        />
      </div>
      <span
        style={{
          fontSize: texto.etiqueta,
          fontWeight: 700,
          color: bajo ? color.coral : color.texto,
        }}
      >
        {nivel}%
      </span>
    </div>
  );
}

// Zona de entrenamiento: la franja de velocidad en la que cae la serie y qué
// cualidad entrena. Es una escala continua, no cuatro cajas sueltas.
export function Zonas({ velocidad = 0.42 }) {
  const zonas = [
    { nombre: 'Fuerza máx.', hasta: 0.5, c: '#D8D4CC' },
    { nombre: 'Fuerza', hasta: 0.75, c: '#CFCBC2' },
    { nombre: 'Potencia', hasta: 1.0, c: '#C6C2B8' },
    { nombre: 'Velocidad', hasta: 1.3, c: '#BDB9AE' },
  ];
  const max = 1.3;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ position: 'relative', height: 30 }}>
        <div style={{ display: 'flex', height: 30, borderRadius: 8, overflow: 'hidden' }}>
          {zonas.map((z, i) => {
            const desde = i === 0 ? 0 : zonas[i - 1].hasta;
            return (
              <div
                key={z.nombre}
                style={{ width: `${((z.hasta - desde) / max) * 100}%`, background: z.c }}
              />
            );
          })}
        </div>
        <div
          style={{
            position: 'absolute',
            left: `${(velocidad / max) * 100}%`,
            top: -5,
            width: 3,
            height: 40,
            borderRadius: 2,
            background: color.coral,
            transform: 'translateX(-50%)',
            boxShadow: '0 2px 6px rgba(238,69,38,0.4)',
          }}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        {zonas.map((z) => (
          <span
            key={z.nombre}
            style={{ fontSize: 9.5, fontWeight: 700, color: color.textoSuave }}
          >
            {z.nombre}
          </span>
        ))}
      </div>
    </div>
  );
}
