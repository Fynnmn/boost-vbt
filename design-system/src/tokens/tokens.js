// Tokens del sistema visual de BOOST.
// Origen: referencia-boost.png (dirección clara, vidrio) + los colores de marca
// que ya usa la app en app/css/app.css. El coral es el mismo #EE4526; lo que
// cambia respecto de la app en producción es el fondo, que pasa de negro a hueso.
//
// Regla que atraviesa todo el sistema: el coral se reserva para el dato que
// decide (la velocidad de la última rep, la caída, el aviso de corte). Si se usa
// para adornar, deja de significar algo.

export const color = {
  fondo: '#F2EFE9',
  texto: '#070707',
  textoMedio: '#5E5B55',
  textoSuave: '#8A877F',

  coral: '#EE4526',
  coralClaro: '#F25A3D',
  coralLogo: '#FF6B4A',
  coralTenue: 'rgba(238, 69, 38, 0.10)',
  coralTenueAlto: 'rgba(238, 69, 38, 0.12)',
  coralBorde: 'rgba(238, 69, 38, 0.35)',

  ambar: '#F2B01E',
  verde: '#35C77A',

  vidrio: 'rgba(255, 255, 255, 0.62)',
  vidrioAlto: 'rgba(255, 255, 255, 0.72)',
  vidrioBorde: 'rgba(255, 255, 255, 0.95)',
  vidrioBordeAlto: 'rgba(255, 255, 255, 0.98)',

  barra: '#E4E1DA',
  linea: 'rgba(7, 7, 7, 0.10)',
  lineaCorte: '#C9C5BD',
  hueco: '#ECEAE4',
  huecoFondo: '#DEDBD3',
};

export const fuente = {
  familia: '"SF Pro Rounded", "Nunito", -apple-system, system-ui, sans-serif',
  // Google Fonts: Nunito cubre la redondeada en Android y en el navegador.
  link: 'https://fonts.googleapis.com/css2?family=Nunito:wght@500;600;700;800;900&display=swap',
};

// Escala tipográfica. El dato principal es deliberadamente enorme: la pantalla
// se mira desde dos metros, de pie, entre repeticiones.
export const texto = {
  dato: 92,
  datoMedio: 56,
  datoChico: 44,
  cifra: 26,
  titulo: 24,
  tituloCard: 19,
  cuerpoFuerte: 17,
  cuerpo: 14,
  chico: 13,
  etiqueta: 12,
  minima: 11,
};

export const radio = {
  card: 26,
  cardAlta: 28,
  cardChica: 24,
  interior: 20,
  fila: 18,
  pildora: 999,
};

export const sombra = {
  card: 'inset 0 1px 0 rgba(255,255,255,1), 0 14px 34px -22px rgba(7,7,7,0.28)',
  cardAlta: 'inset 0 1px 0 rgba(255,255,255,1), 0 18px 40px -24px rgba(7,7,7,0.32)',
  boton: 'inset 0 2px 0 rgba(255,255,255,1), inset 0 -8px 14px rgba(7,7,7,0.05), 0 12px 24px -12px rgba(7,7,7,0.35)',
  botonPrincipal: 'inset 0 3px 0 rgba(255,255,255,1), inset 0 -12px 20px rgba(7,7,7,0.06), 0 18px 34px -14px rgba(7,7,7,0.4)',
  botonCoral: 'inset 0 1px 0 rgba(255,255,255,0.35), 0 14px 28px -12px rgba(238,69,38,0.65)',
};

// Pantalla de referencia: iPhone 14/15 en puntos. Sin barra de estado dibujada,
// el teléfono pone la suya encima.
export const pantalla = { ancho: 390, alto: 844, margen: 16, arriba: 44 };

export const movimiento = {
  curva: 'cubic-bezier(0.22, 0.61, 0.30, 1)',
  rapido: '120ms',
  normal: '220ms',
};

// Umbral de corte por defecto. La pérdida es 1 − última / mejor de la serie;
// el corte del 20 % es el criterio que ya usa el firmware.
export const vbt = { objetivoCorte: 0.5, perdidaCorte: 0.2 };
