/* ============================================================
   icons.js — el set de íconos.

   DIBUJADOS, NO EMOJI. Un 🏋️ se ve distinto en cada sistema operativo,
   no se puede recolorear, no se alinea con el texto y arrastra el estilo
   de otra marca a la interfaz. Estos son trazos propios: heredan el
   color del texto con `currentColor`, escalan sin perder nitidez y pesan
   unos pocos bytes cada uno.

   UN SOLO ESTILO PARA TODOS, que es lo que hace que un set parezca un
   set y no una colección:

   · lienzo de 24×24, con los trazos sobre la grilla entera;
   · grosor 1,75 — a 1,5 se ven anémicos sobre negro, a 2 se empastan
     en los tamaños chicos;
   · puntas y uniones redondeadas;
   · sin relleno salvo donde la forma lo pide (el punto del sensor);
   · `vector-effect: non-scaling-stroke` para que el grosor no engorde
     cuando el ícono se dibuja más grande que su lienzo.
   ============================================================ */

const TRAZOS = {
  /* --- Navegación ------------------------------------------- */

  // Entrenar: una barra con discos. Es el objeto del producto.
  barra: '<path d="M2 12h2M20 12h2"/><rect x="4" y="8" width="3" height="8" rx="1"/><rect x="17" y="8" width="3" height="8" rx="1"/><path d="M7 12h10"/>',

  // Historial: reloj con flecha de retroceso.
  historial: '<path d="M3.05 11a9 9 0 1 1 .5 4"/><path d="M3 20v-5h5"/><path d="M12 7v5l3.5 2"/>',

  /* Perfil: la recta carga-velocidad bajando entre sus puntos.
     La primera versión arrancaba la diagonal pegada al vértice del eje
     y las dos se leían como un solo trazo roto. Ahora la recta empieza
     despegada, y los puntos van rellenos y fuera de ella para que se
     distingan del trazo a 22px. */
  perfil: '<path d="M4 3.5v17h17"/><path d="M7.5 7.5L19 17"/><circle cx="9.5" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="14" cy="15.5" r="1.5" fill="currentColor" stroke="none"/>',

  /* --- Estado del sensor ------------------------------------ */

  bluetooth: '<path d="M7 7l10 10-5 4V3l5 4L7 17"/>',

  /* Sensor: el cuerpo del dispositivo con su luz y sus imanes a los
     lados. Sin los imanes era idéntico al ícono de batería. */
  sensor: '<rect x="5" y="7" width="14" height="10" rx="3"/><path d="M10 12h4"/><path d="M3 10v4M21 10v4"/>',

  bateria: '<rect x="2" y="7" width="17" height="10" rx="2.5"/><path d="M22 11v2"/><path d="M5.5 10.5v3"/>',

  /* --- Acciones --------------------------------------------- */

  mas: '<path d="M12 5v14M5 12h14"/>',
  menos: '<path d="M5 12h14"/>',
  play: '<path d="M7 4.5l12 7.5-12 7.5z" stroke-linejoin="round"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2.5"/>',
  check: '<path d="M4 12.5l5.5 5.5L20 6.5"/>',
  /* Flecha circular: releer del sensor. Abierta arriba para que se lea
     como ciclo y no como un cero. */
  recargar: '<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 3.5V9h-5.5"/>',
  cerrar: '<path d="M6 6l12 12M18 6L6 18"/>',
  descargar: '<path d="M12 3v12"/><path d="M7.5 10.5L12 15l4.5-4.5"/><path d="M4 17v2.5A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5V17"/>',
  basura: '<path d="M4 7h16"/><path d="M10 4h4"/><path d="M6 7l1 13h10l1-13"/><path d="M10.5 11v6M13.5 11v6"/>',

  /* --- Señales ---------------------------------------------- */

  aviso: '<path d="M12 3.5L22 20H2z"/><path d="M12 10v4.5"/><circle cx="12" cy="17.6" r="0.9" fill="currentColor" stroke="none"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5"/><circle cx="12" cy="7.8" r="0.9" fill="currentColor" stroke="none"/>',

  sonidoSi: '<path d="M4 9.5h3.5L12 5.5v13L7.5 14.5H4z"/><path d="M16 9.2a4 4 0 0 1 0 5.6"/><path d="M18.6 6.6a7.6 7.6 0 0 1 0 10.8"/>',
  sonidoNo: '<path d="M4 9.5h3.5L12 5.5v13L7.5 14.5H4z"/><path d="M16.5 10l4 4M20.5 10l-4 4"/>',

  /* Voz: la onda de una frase hablada, no un parlante. Tiene que
     distinguirse del ícono de sonido de al lado a 18 px, y dos
     parlantes con distinta cantidad de ondas no se distinguen. Barras
     asimétricas —alta, baja, alta— porque una onda simétrica se lee
     como un ecualizador detenido. */
  voz: '<path d="M4 10.5v3"/><path d="M8 7v10"/><path d="M12 4.5v15"/><path d="M16 8.5v7"/><path d="M20 11v2"/>',
  vozNo: '<path d="M4 10.5v3"/><path d="M8 9v6"/><path d="M12 10.5v3"/><path d="M3.5 20.5l17-17"/>',

  // Velocidad: el trazo del logo, reducido a un ícono.
  velocidad: '<path d="M3 17l5-5 3.5 3L21 6"/><path d="M15.5 6H21v5.5"/>',
};

/**
 * Devuelve el SVG de un ícono como texto.
 * @param {string} nombre  clave de TRAZOS
 * @param {number} tam     lado en px
 * @param {object} extra   { clase, grosor }
 */
export function icono(nombre, tam = 20, { clase = '', grosor = 1.75 } = {}) {
  const d = TRAZOS[nombre];
  if (!d) return '';
  return `<svg class="ico ${clase}" width="${tam}" height="${tam}" viewBox="0 0 24 24" ` +
    `fill="none" stroke="currentColor" stroke-width="${grosor}" ` +
    `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${d}</svg>`;
}

/** La misma forma, ya como nodo, para cuando hay que insertarlo sin innerHTML. */
export function iconoNodo(nombre, tam = 20, opciones) {
  const cont = document.createElement('span');
  cont.style.display = 'inline-flex';
  cont.innerHTML = icono(nombre, tam, opciones);
  return cont.firstElementChild;
}

export const NOMBRES = Object.keys(TRAZOS);
