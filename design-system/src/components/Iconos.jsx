import React from 'react';
import { color } from '../tokens/tokens.js';

// Iconos de trazo, grilla de 24, un solo estilo. Nunca emoji: escalan mal y no
// se pueden recolorear con el estado.
const base = (tam, trazo, c) => ({
  width: tam,
  height: tam,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: c,
  strokeWidth: trazo,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
});

export function IconoBarra({ tam = 30, c = '#2A2926', trazo = 2 }) {
  return (
    <svg {...base(tam, trazo, c)}>
      <path d="M8 12h8" />
      <rect x="5" y="7.5" width="3" height="9" rx="1" />
      <rect x="16" y="7.5" width="3" height="9" rx="1" />
      <path d="M3 10v4M21 10v4" />
    </svg>
  );
}

export function IconoBarras({ tam = 22, c = color.coral, trazo = 3 }) {
  return (
    <svg {...base(tam, trazo, c)}>
      <path d="M6 18v-4" />
      <path d="M12 18v-8" />
      <path d="M18 18V6" />
    </svg>
  );
}

export function IconoCaida({ tam = 18, c = color.coral, trazo = 2.4 }) {
  return (
    <svg {...base(tam, trazo, c)}>
      <path d="M12 5v14" />
      <path d="M6 13l6 6 6-6" />
    </svg>
  );
}

export function IconoObjetivo({ tam = 18, c = '#2A2926', trazo = 2.2 }) {
  return (
    <svg {...base(tam, trazo, c)}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 4v2M12 18v2M4 12h2M18 12h2" />
    </svg>
  );
}

export function IconoBluetooth({ tam = 20, c = color.coral, trazo = 2.2 }) {
  return (
    <svg {...base(tam, trazo, c)}>
      <path d="M7 7l10 10-5 5V2l5 5L7 17" />
    </svg>
  );
}

export function IconoReloj({ tam = 16, c = color.texto, trazo = 2.2 }) {
  return (
    <svg {...base(tam, trazo, c)}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l3 2" />
    </svg>
  );
}

export function IconoAviso({ tam = 20, c = color.coral, trazo = 2.4 }) {
  return (
    <svg {...base(tam, trazo, c)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5" />
      <circle cx="12" cy="16.5" r="0.6" fill={c} />
    </svg>
  );
}

export function IconoMas({ tam = 20, c = '#2A2926', trazo = 2.2 }) {
  return (
    <svg {...base(tam, trazo, c)}>
      <path d="M12 6v12M6 12h12" />
    </svg>
  );
}

export function IconoMenos({ tam = 20, c = '#2A2926', trazo = 2.2 }) {
  return (
    <svg {...base(tam, trazo, c)}>
      <path d="M6 12h12" />
    </svg>
  );
}

export function IconoDetener({ tam = 20, c = '#2A2926' }) {
  return (
    <svg width={tam} height={tam} viewBox="0 0 24 24" fill={c}>
      <rect x="6" y="6" width="12" height="12" rx="2.5" />
    </svg>
  );
}

export function IconoPausa({ tam = 32, c = color.texto }) {
  return (
    <svg width={tam} height={tam} viewBox="0 0 24 24" fill={c}>
      <rect x="6" y="4" width="4.5" height="16" rx="2" />
      <rect x="13.5" y="4" width="4.5" height="16" rx="2" />
    </svg>
  );
}

export function IconoReiniciar({ tam = 22, c = '#2A2926', trazo = 2.2 }) {
  return (
    <svg {...base(tam, trazo, c)}>
      <path d="M4 12a8 8 0 1 0 2.5-5.8" />
      <path d="M4 4v5h5" />
    </svg>
  );
}

export function IconoFlecha({ tam = 20, c = color.textoSuave, trazo = 2.2 }) {
  return (
    <svg {...base(tam, trazo, c)}>
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

export function IconoOnda({ tam = 18, c = '#2A2926', trazo = 2.2 }) {
  return (
    <svg {...base(tam, trazo, c)}>
      <path d="M4 12h2l2-6 3 12 3-9 2 3h4" />
    </svg>
  );
}

export function IconoMas3({ tam = 18, c = color.texto, trazo = 2.2 }) {
  return (
    <svg {...base(tam, trazo, c)}>
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </svg>
  );
}

export function IconoUsuario({ tam = 20, c = '#2A2926', trazo = 2.1 }) {
  return (
    <svg {...base(tam, trazo, c)}>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </svg>
  );
}

export function IconoCorreo({ tam = 20, c = '#8A877F', trazo = 2.1 }) {
  return (
    <svg {...base(tam, trazo, c)}>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="M4 8l8 5 8-5" />
    </svg>
  );
}

export function IconoCandado({ tam = 20, c = '#8A877F', trazo = 2.1 }) {
  return (
    <svg {...base(tam, trazo, c)}>
      <rect x="4.5" y="10" width="15" height="10" rx="3" />
      <path d="M8 10V7.5a4 4 0 0 1 8 0V10" />
    </svg>
  );
}

export function IconoVolver({ tam = 20, c = '#070707', trazo = 2.3 }) {
  return (
    <svg {...base(tam, trazo, c)}>
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}

export function IconoCerrar({ tam = 20, c = '#070707', trazo = 2.3 }) {
  return (
    <svg {...base(tam, trazo, c)}>
      <path d="M7 7l10 10M17 7L7 17" />
    </svg>
  );
}

export function IconoCampana({ tam = 20, c = '#2A2926', trazo = 2.1 }) {
  return (
    <svg {...base(tam, trazo, c)}>
      <path d="M6 10a6 6 0 0 1 12 0c0 4 1.5 5.5 1.5 5.5h-15S6 14 6 10z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </svg>
  );
}

export function IconoDescarga({ tam = 20, c = '#2A2926', trazo = 2.1 }) {
  return (
    <svg {...base(tam, trazo, c)}>
      <path d="M12 4v10" />
      <path d="M8 11l4 4 4-4" />
      <path d="M5 19h14" />
    </svg>
  );
}

export function IconoAyuda({ tam = 20, c = '#2A2926', trazo = 2.1 }) {
  return (
    <svg {...base(tam, trazo, c)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.6 2.6 0 0 1 5 1c0 1.8-2.5 2-2.5 3.5" />
      <circle cx="12" cy="17" r="0.6" fill={c} />
    </svg>
  );
}

export function IconoEscudo({ tam = 20, c = '#2A2926', trazo = 2.1 }) {
  return (
    <svg {...base(tam, trazo, c)}>
      <path d="M12 3l7 3v6c0 4.2-3 7.3-7 9-4-1.7-7-4.8-7-9V6z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

export function IconoRegla({ tam = 20, c = '#2A2926', trazo = 2.1 }) {
  return (
    <svg {...base(tam, trazo, c)}>
      <rect x="3" y="8" width="18" height="8" rx="2" />
      <path d="M7 8v3M11 8v4M15 8v3M19 8v4" />
    </svg>
  );
}

export function IconoBuscar({ tam = 20, c = '#8A877F', trazo = 2.1 }) {
  return (
    <svg {...base(tam, trazo, c)}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4 4" />
    </svg>
  );
}

export function IconoTilde({ tam = 20, c = '#35C77A', trazo = 2.6 }) {
  return (
    <svg {...base(tam, trazo, c)}>
      <path d="M5 12.5l4.5 4.5L19 7" />
    </svg>
  );
}

export function IconoSinSenal({ tam = 20, c = '#EE4526', trazo = 2.2 }) {
  return (
    <svg {...base(tam, trazo, c)}>
      <path d="M7 7l10 10-5 5V2l5 5" />
      <path d="M3 3l18 18" />
    </svg>
  );
}

export function IconoRayo({ tam = 20, c = '#2A2926', trazo = 2.1 }) {
  return (
    <svg {...base(tam, trazo, c)}>
      <path d="M13 3L6 13h5l-1 8 7-10h-5z" />
    </svg>
  );
}

export function IconoCalendario({ tam = 20, c = '#2A2926', trazo = 2.1 }) {
  return (
    <svg {...base(tam, trazo, c)}>
      <rect x="4" y="5" width="16" height="15" rx="3" />
      <path d="M4 10h16M9 3v4M15 3v4" />
    </svg>
  );
}

export function IconoSalir({ tam = 20, c = '#EE4526', trazo = 2.1 }) {
  return (
    <svg {...base(tam, trazo, c)}>
      <path d="M14 5H7a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h7" />
      <path d="M17 15l3-3-3-3M20 12h-9" />
    </svg>
  );
}
