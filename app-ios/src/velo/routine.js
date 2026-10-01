// ─── RUTINAS DE BOOST ─────────────────────────────────────────────────
// Motor de reglas que arma la rutina: deporte, posición, temporada, día de partido,
// entrenamientos de cancha, días y tiempo disponibles, prioridad, molestias y equipo,
// más el perfil (edad, peso, nivel) y las cargas medidas con el sensor.
//
// Las reglas deciden todo lo que tiene que ser seguro y consistente (ejercicios,
// series, cargas, días); Nova después explica el porqué con la evidencia
// (backend/worker, /nova/routine). La base científica de cada regla está en las
// fichas de backend/worker/src/knowledge.js, todas con citas verificadas:
//  · fuerza pesada (>80 % 1RM) para fuerza máxima; cualquier carga cerca del fallo para
//    hipertrofia (Currier 2023; Schoenfeld 2017)
//  · cortar por pérdida de velocidad: 10–15 % potencia, 15–20 % fuerza, 20–30 % hipertrofia
//    (Pareja-Blanco 2017, 2020; Refalo 2023)
//  · en temporada, 1–2 sesiones cortas manteniendo la intensidad; descarga cada 4 semanas
//  · nórdicos (−51 % desgarros de isquios, van Dyk 2019), Copenhagen (−41 % problemas de
//    ingle, Harøy 2019), programa de hombro para lanzadores (−28 %, Andersson 2017)
//  · fuerza de piernas → sprint (Seitz 2014); unilateral → salto a una pierna (Liao 2022);
//    multimodal → saque (Deng 2024); fuerza pesada → economía de carrera (Blagrove 2018)
//
// Puro: sin DOM ni red. Lo importan src/velo/real.js (app) y las pruebas del Worker.

const DAY = 864e5;
const r25 = x => Math.round(x / 2.5) * 2.5;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const DOW = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const DOW_LONG = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

// ── Deportes y posiciones ──
// Perfil de demandas (0 a 2): str fuerza/masa · spd velocidad · jmp salto · up tren superior
// · rot rotación · lat cambios de dirección · end resistencia · neck cuello/contacto.
const P = (str, spd, jmp, up, rot, lat, end, neck) => ({ str, spd, jmp, up, rot, lat, end, neck });

export const SPORTS = [
  { id: 'rugby', t: 'Rugby', d: 'Contacto y sprints', match: true, prevent: ['nordic', 'neck', 'core'],
    p: 'M5 19C3 13 7 5 19 5c2 6-2 14-14 14zM8.5 15.5l7-7M10 10l1.5 1.5M12.5 12.5L14 14',
    pos: [
      { id: 'primera', t: 'Primera línea', d: 'Pilar u hooker', prof: P(2, 0, 0, 2, 0, 0, 1, 2) },
      { id: 'segunda', t: 'Segunda línea', d: 'Line y contacto', prof: P(2, 0, 2, 1, 0, 0, 1, 2) },
      { id: 'tercera', t: 'Tercera línea', d: 'Tackle y trabajo', prof: P(2, 1, 1, 1, 0, 1, 2, 2) },
      { id: 'medios', t: 'Medio o apertura', d: 'Decisión y pase', prof: P(1, 1, 0, 1, 1, 2, 1, 1) },
      { id: 'centro', t: 'Centro', d: 'Contacto y velocidad', prof: P(1, 2, 1, 1, 0, 2, 1, 1) },
      { id: 'wing', t: 'Wing o fullback', d: 'Velocidad máxima', prof: P(1, 2, 1, 0, 0, 2, 1, 1) }],
    prio: [['contacto', 'Ganar el contacto'], ['aceleracion', 'Arrancar más rápido'], ['velocidad', 'Velocidad máxima'], ['masa', 'Ganar masa muscular'], ['lesiones', 'Evitar lesiones']] },
  { id: 'futbol', t: 'Fútbol', d: 'Aceleración y cambios', match: true, prevent: ['nordic', 'copenhagen', 'ankle', 'core'],
    p: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 7.5l4 2.9-1.5 4.7h-5L8 10.4z',
    pos: [
      { id: 'arquero', t: 'Arquero', d: 'Saltos laterales', prof: P(1, 0, 2, 1, 1, 2, 0, 0) },
      { id: 'central', t: 'Defensor central', d: 'Duelo aéreo', prof: P(2, 1, 2, 1, 0, 1, 1, 1) },
      { id: 'lateral', t: 'Lateral', d: 'Ida y vuelta', prof: P(1, 2, 1, 0, 0, 2, 2, 0) },
      { id: 'medio', t: 'Mediocampista', d: 'Resistencia y cambios', prof: P(1, 1, 1, 0, 1, 2, 2, 0) },
      { id: 'extremo', t: 'Extremo', d: 'Velocidad y regate', prof: P(1, 2, 1, 0, 0, 2, 1, 0) },
      { id: 'delantero', t: 'Delantero', d: 'Arranque y choque', prof: P(1, 2, 2, 1, 0, 1, 1, 0) }],
    prio: [['aceleracion', 'Arrancar más rápido'], ['velocidad', 'Velocidad máxima'], ['salto', 'Saltar más'], ['fuerza', 'Ganar el cuerpo a cuerpo'], ['lesiones', 'Evitar lesiones']] },
  { id: 'basquet', t: 'Básquet', d: 'Salto y potencia', match: true, prevent: ['ankle', 'landing', 'nordic', 'core'],
    p: 'M12 21a9 9 0 100-18 9 9 0 000 18zM3 12h18M12 3v18M5.6 5.6c3 3 3 9.8 0 12.8M18.4 5.6c-3 3-3 9.8 0 12.8',
    pos: [
      { id: 'base', t: 'Base', d: 'Velocidad y cambios', prof: P(1, 2, 1, 0, 0, 2, 1, 0) },
      { id: 'alero', t: 'Escolta o alero', d: 'Salto y velocidad', prof: P(1, 1, 2, 0, 0, 2, 1, 0) },
      { id: 'interno', t: 'Ala-pivot o pivot', d: 'Fuerza y rebote', prof: P(2, 0, 2, 1, 0, 1, 1, 1) }],
    prio: [['salto', 'Saltar más'], ['aceleracion', 'Primer paso más rápido'], ['fuerza', 'Aguantar el contacto'], ['lesiones', 'Evitar lesiones']] },
  { id: 'voley', t: 'Vóley', d: 'Salto y hombros', match: true, prevent: ['shoulder', 'landing', 'ankle', 'core'],
    p: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 3c3 3 4 7 2.5 11M4 8c4 0 8 1.5 11 5M5 18c2-4 5-7 10-8',
    pos: [
      { id: 'armador', t: 'Armador', d: 'Rapidez y saltos', prof: P(1, 1, 1, 1, 0, 2, 1, 0) },
      { id: 'punta', t: 'Punta u opuesto', d: 'Salto y remate', prof: P(1, 1, 2, 2, 1, 1, 1, 0) },
      { id: 'central', t: 'Central', d: 'Salto máximo', prof: P(1, 1, 2, 1, 0, 1, 1, 0) },
      { id: 'libero', t: 'Líbero', d: 'Defensa y reacción', prof: P(1, 1, 0, 0, 0, 2, 1, 0) }],
    prio: [['salto', 'Saltar más'], ['remate', 'Rematar más fuerte'], ['lesiones', 'Cuidar hombros y rodillas']] },
  { id: 'handball', t: 'Handball', d: 'Lanzar y chocar', match: true, prevent: ['shoulder', 'nordic', 'copenhagen', 'core'],
    p: 'M12 21a9 9 0 100-18 9 9 0 000 18zM8 7c2 2 2 8 0 10M16 7c-2 2-2 8 0 10',
    pos: [
      { id: 'arquero', t: 'Arquero', d: 'Reacción y saltos', prof: P(1, 0, 2, 1, 1, 2, 0, 0) },
      { id: 'pivote', t: 'Pivote', d: 'Contacto', prof: P(2, 0, 1, 2, 1, 1, 1, 1) },
      { id: 'lateral', t: 'Lateral o central', d: 'Lanzamiento', prof: P(1, 1, 2, 2, 2, 1, 1, 0) },
      { id: 'extremo', t: 'Extremo', d: 'Velocidad y salto', prof: P(1, 2, 2, 1, 1, 2, 1, 0) }],
    prio: [['lanzamiento', 'Lanzar más fuerte'], ['fuerza', 'Ganar el contacto'], ['aceleracion', 'Arrancar más rápido'], ['lesiones', 'Evitar lesiones']] },
  { id: 'hockey', t: 'Hockey', d: 'Sprints y giros', match: true, prevent: ['nordic', 'copenhagen', 'ankle', 'core'],
    p: 'M9 3l3.5 14.5c.3 1.3 1.4 2 2.7 2H20M4 20h3.5M16.5 16.5a1.5 1.5 0 100 3',
    pos: [
      { id: 'arquero', t: 'Arquero', d: 'Reacción lateral', prof: P(1, 0, 1, 1, 1, 2, 0, 0) },
      { id: 'defensor', t: 'Defensor', d: 'Fuerza y anticipo', prof: P(2, 1, 1, 1, 1, 1, 1, 0) },
      { id: 'volante', t: 'Volante', d: 'Resistencia y cambios', prof: P(1, 1, 1, 0, 1, 2, 2, 0) },
      { id: 'delantero', t: 'Delantero', d: 'Arranque y tiro', prof: P(1, 2, 1, 1, 2, 2, 1, 0) }],
    prio: [['aceleracion', 'Arrancar más rápido'], ['fuerza', 'Ganar la pelota dividida'], ['tiro', 'Pegar más fuerte'], ['lesiones', 'Evitar lesiones']] },
  { id: 'raqueta', t: 'Tenis o pádel', d: 'Rotación y piernas', match: false, prevent: ['shoulder', 'ankle', 'core'],
    p: 'M12 21a9 9 0 100-18 9 9 0 000 18zM5.5 5.8c3.5 3.2 3.5 9.2 0 12.4M18.5 5.8c-3.5 3.2-3.5 9.2 0 12.4',
    pos: [
      { id: 'tenis', t: 'Tenis', d: 'Saque y desplazamiento', prof: P(1, 1, 1, 1, 2, 2, 1, 0) },
      { id: 'padel', t: 'Pádel', d: 'Remate y reflejos', prof: P(1, 1, 1, 1, 2, 2, 1, 0) }],
    prio: [['saque', 'Sacar o rematar más fuerte'], ['desplazamiento', 'Moverme más rápido'], ['lesiones', 'Cuidar hombro y codo']] },
  { id: 'atletismo', t: 'Atletismo', d: 'Velocidad, saltos, lanzamientos', match: false, prevent: ['nordic', 'ankle', 'core'],
    p: 'M14 4.5a1.8 1.8 0 100-3.6 1.8 1.8 0 000 3.6zM6 21l3.5-6 3 2.5V22M9.5 15l1.5-6 4 3h4M11 9L7 11',
    pos: [
      { id: 'velocidad', t: 'Velocidad', d: '60 a 400 m', prof: P(1, 2, 2, 0, 0, 0, 0, 0) },
      { id: 'saltos', t: 'Saltos o vallas', d: 'Largo, alto, triple', prof: P(1, 2, 2, 0, 0, 1, 0, 0) },
      { id: 'lanzamientos', t: 'Lanzamientos', d: 'Bala, disco, jabalina', prof: P(2, 0, 1, 2, 2, 0, 0, 0) },
      { id: 'fondo', t: 'Medio fondo o fondo', d: '800 m en adelante', prof: P(1, 0, 1, 0, 0, 0, 2, 0) }],
    prio: [['rendimiento', 'Mejorar mi marca'], ['fuerza', 'Ser más fuerte'], ['lesiones', 'Evitar lesiones']] },
  { id: 'natacion', t: 'Natación', d: 'Tracción y hombros', match: false, prevent: ['shoulder', 'core'],
    p: 'M16 8.5a1.8 1.8 0 100-3.6 1.8 1.8 0 000 3.6zM5 12.5l5-3.5 3 2.5M3 17c1.5 1 3 1 4.5 0s3-1 4.5 0 3 1 4.5 0 3-1 4.5 0M3 20.5c1.5 1 3 1 4.5 0s3-1 4.5 0 3 1 4.5 0 3-1 4.5 0',
    pos: [
      { id: 'velocidad', t: 'Velocidad', d: '50 a 100 m', prof: P(1, 1, 2, 2, 0, 0, 0, 0) },
      { id: 'fondo', t: 'Medio fondo o fondo', d: '200 m en adelante', prof: P(1, 0, 1, 2, 0, 0, 2, 0) }],
    prio: [['rendimiento', 'Mejorar mis tiempos'], ['salidas', 'Salidas y vueltas'], ['lesiones', 'Cuidar los hombros']] },
  { id: 'combate', t: 'Combate', d: 'Boxeo, judo, MMA', match: false, prevent: ['neck', 'shoulder', 'core'],
    p: 'M7 10V6.5A2.5 2.5 0 0112 6v0a2.5 2.5 0 015 .5V13a6 6 0 01-6 6H10a3 3 0 01-3-3zM7 10h10',
    pos: [
      { id: 'golpe', t: 'Boxeo o kick', d: 'Pegada y velocidad', prof: P(1, 1, 1, 1, 2, 2, 2, 1) },
      { id: 'agarre', t: 'Judo o lucha', d: 'Agarre y fuerza', prof: P(2, 0, 1, 2, 1, 1, 2, 2) },
      { id: 'mixto', t: 'MMA o BJJ', d: 'Todo un poco', prof: P(2, 1, 1, 2, 1, 1, 2, 2) }],
    prio: [['potencia', 'Pegar o proyectar más fuerte'], ['fuerza', 'Ser más fuerte sin subir de peso'], ['lesiones', 'Evitar lesiones']] }
];

export const OBJECTIVES = [
  { id: 'fuerza', t: 'Fuerza', d: 'Cargas máximas', p: 'M2 12h3.5M18.5 12H22M8.5 12h7M5.5 7.5h3v9h-3zM15.5 7.5h3v9h-3z', prof: P(2, 0, 0, 1, 0, 0, 0, 0) },
  { id: 'potencia', t: 'Potencia', d: 'Rápido y explosivo', p: 'M13 2.5L5.5 13.5H12l-1 8 7.5-11H12z', prof: P(1, 2, 2, 1, 0, 0, 0, 0) },
  { id: 'hipertrofia', t: 'Hipertrofia', d: 'Masa muscular', p: 'M12 3.5l8.5 4.5-8.5 4.5L3.5 8zM3.5 12l8.5 4.5 8.5-4.5M3.5 16l8.5 4.5 8.5-4.5', prof: P(2, 0, 0, 2, 0, 0, 0, 0) },
  { id: 'salud', t: 'Salud y forma', d: 'Fuerte y en forma', p: 'M12 20s-7-4.3-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.7-7 10-7 10z', prof: P(1, 0, 0, 1, 0, 0, 1, 0) }
];

const INJ = [['rodilla', 'Rodilla'], ['espalda', 'Espalda baja'], ['hombro', 'Hombro'], ['isquios', 'Isquios'], ['tobillo', 'Tobillo'], ['ingle', 'Ingle o aductores'], ['codo', 'Codo o muñeca']];
const EQ = [['completo', 'Gimnasio completo', 'Rack, barra y plataforma'], ['sinplat', 'Sin plataforma', 'No se pueden tirar cargadas'], ['basico', 'Sin rack', 'Barra, mancuernas y máquinas']];
const SEASONS = [['pre', 'Pretemporada'], ['in', 'En temporada'], ['off', 'Fuera de temporada']];

const sportOf = id => SPORTS.find(s => s.id === id);
const objOf = id => OBJECTIVES.find(o => o.id === id);

// Respuestas por defecto (lo que ya está elegido al abrir el formulario).
export function defaultAnswers(profile = {}) {
  const g = (profile.goals || [])[0];
  const obj = { fuerza: 'fuerza', potencia: 'potencia', hipertrofia: 'hipertrofia' }[g];
  return { mode: obj ? 'obj' : 'sport', focus: obj || 'rugby', pos: null, season: 'pre', match: 5, field: 2,
    days: clamp((profile.week || []).length || 3, 2, 5), mins: 60, prio: null, inj: [], eq: 'completo', weeks: 6 };
}

// ── Preguntas ──
// Solo lo que Nova no sabe: peso, edad, altura, nivel y cargas ya están en el perfil.
// Cada pregunta: { id, t, s, kind: 'focus'|'grid'|'chips'|'multi', opts: [{ v, t, d?, p? }] }.
export function questions(a) {
  const sp = a.mode === 'sport' ? sportOf(a.focus) : null, q = [];
  q.push({ id: 'focus', kind: 'focus', t: '¿Para qué entrenás?', s: 'Elegí tu deporte o un objetivo.',
    opts: (a.mode === 'sport' ? SPORTS : OBJECTIVES).map(o => ({ v: o.id, t: o.t, d: o.d, p: o.p })) });
  if (sp) {
    q.push({ id: 'pos', kind: 'grid', t: sp.id === 'atletismo' || sp.id === 'natacion' ? '¿Qué pruebas hacés?' : sp.id === 'raqueta' ? '¿Tenis o pádel?' : sp.id === 'combate' ? '¿Qué estilo?' : '¿En qué posición jugás?',
      s: 'Cada puesto necesita cosas distintas.', opts: sp.pos.map(p => ({ v: p.id, t: p.t, d: p.d })) });
    q.push({ id: 'season', kind: 'chips', t: '¿En qué momento de la temporada estás?', s: 'En temporada se entrena menos volumen para llegar fresco.',
      opts: SEASONS.map(([v, t]) => ({ v, t })) });
    if (sp.match && a.season !== 'off')
      q.push({ id: 'match', kind: 'chips', t: '¿Qué día jugás?', s: 'Para no cargarte las piernas antes del partido.',
        opts: [...DOW.map((t, v) => ({ v, t })), { v: -1, t: 'Sin día fijo' }] });
    q.push({ id: 'field', kind: 'chips', t: sp.id === 'natacion' ? '¿Cuántas veces nadás por semana?' : sp.id === 'atletismo' ? '¿Cuántas veces entrenás en pista?' : '¿Cuántos entrenamientos de ' + (sp.id === 'combate' ? 'técnica' : 'cancha') + ' tenés por semana?',
      s: 'El gimnasio se ajusta a esa carga.', opts: [[1, '0 o 1'], [2, '2'], [3, '3'], [4, '4 o más']].map(([v, t]) => ({ v, t })) });
  }
  q.push({ id: 'days', kind: 'chips', t: '¿Cuántos días podés ir al gimnasio?', s: sp && a.season === 'in' ? 'En temporada, con 2 alcanza para mantener y mejorar.' : 'Contá solo los días que seguro podés.',
    opts: [2, 3, 4, 5].map(v => ({ v, t: String(v) })) });
  q.push({ id: 'mins', kind: 'chips', t: '¿Cuánto tiempo tenés por sesión?', s: 'Con entrada en calor incluida.',
    opts: [[45, '45 min'], [60, '1 hora'], [75, '75 min o más']].map(([v, t]) => ({ v, t })) });
  if (sp) q.push({ id: 'prio', kind: 'grid', t: '¿Qué querés mejorar primero?', s: 'La rutina pone más énfasis ahí.', opts: sp.prio.map(([v, t]) => ({ v, t })) });
  q.push({ id: 'inj', kind: 'multi', t: '¿Algo te molesta o te lesionaste hace poco?', s: 'Cambiamos ejercicios para no empeorarlo. Si duele, consultá a un profesional.',
    opts: [{ v: 'nada', t: 'Nada' }, ...INJ.map(([v, t]) => ({ v, t }))] });
  q.push({ id: 'eq', kind: 'grid', t: '¿Con qué equipo contás?', s: 'El sensor va en una barra.', opts: EQ.map(([v, t, d]) => ({ v, t, d })) });
  q.push({ id: 'weeks', kind: 'chips', t: '¿Cuánto dura el plan?', s: 'Cada 4 semanas hay una de descarga.', opts: [4, 6, 8].map(v => ({ v, t: v + ' semanas' })) });
  return q;
}

// Completa respuestas faltantes o que ya no aplican (ej. cambió de deporte).
export function normalize(a0, profile = {}) {
  const a = { ...defaultAnswers(profile), ...(a0 || {}) };
  const sp = a.mode === 'sport' ? sportOf(a.focus) : null;
  if (a.mode === 'sport' && !sp) a.focus = 'rugby';
  if (a.mode === 'obj' && !objOf(a.focus)) a.focus = 'fuerza';
  const s2 = a.mode === 'sport' ? sportOf(a.focus) : null;
  if (s2) {
    if (!s2.pos.some(p => p.id === a.pos)) a.pos = s2.pos[0].id;
    if (!s2.prio.some(([v]) => v === a.prio)) a.prio = s2.prio[0][0];
    if (!s2.match || a.season === 'off') a.match = -1;
  } else { a.pos = null; a.prio = null; a.match = -1; a.season = 'off'; }
  a.days = clamp(+a.days || 3, 2, 5); a.weeks = [4, 6, 8].includes(+a.weeks) ? +a.weeks : 6;
  a.mins = [45, 60, 75].includes(+a.mins) ? +a.mins : 60;
  a.inj = (Array.isArray(a.inj) ? a.inj : []).filter(x => INJ.some(([v]) => v === x));
  if (!EQ.some(([v]) => v === a.eq)) a.eq = 'completo';
  return a;
}

// ── Cargas ──
// 1RM de referencia: el medido con el sensor (perfil carga-velocidad) o, si no hay,
// la carga del perfil ("un peso que muevas cómodo para 3 reps" ≈ 85 % del 1RM).
// Los ejercicios sin dato se estiman desde uno parecido; si tampoco hay, sin kg:
// se elige la carga para salir en la zona de velocidad.
const DERIVE = {
  'Sentadilla frontal': ['Sentadilla', 0.82], 'Peso muerto rumano': ['Peso muerto', 0.7], 'Hip thrust': ['Sentadilla', 1.1],
  'Press inclinado': ['Press banca', 0.8], 'Press militar': ['Press banca', 0.62], 'Push press': ['Press banca', 0.8],
  'Remo con barra': ['Press banca', 0.75], 'Cargada colgante': ['Sentadilla', 0.5], 'Sentadilla salto': ['Sentadilla', 1],
  'Zancadas': ['Sentadilla', 0.45], 'Sentadilla búlgara': ['Sentadilla', 0.4], 'Peso muerto': ['Sentadilla', 1.15]
};
function oneRM(ex, ctx, seen = 0) {
  const m = ctx.oneRM && ctx.oneRM(ex);
  if (m) return m;
  const l = ctx.loads && +ctx.loads[ex];
  if (l > 0) return l / 0.85;
  const d = DERIVE[ex];
  if (d && seen < 2) { const b = oneRM(d[0], ctx, seen + 1); return b ? b * d[1] : null; }
  return null;
}

// Velocidad de corte (m/s) por ejercicio, la misma idea que el resto de la app:
// fuerza = la base; potencia e hipertrofia cortan antes (más rápido).
const CUT = { 'Sentadilla': 0.55, 'Sentadilla frontal': 0.55, 'Press banca': 0.5, 'Press inclinado': 0.5, 'Peso muerto': 0.45, 'Peso muerto rumano': 0.5,
  'Press militar': 0.5, 'Push press': 0.8, 'Remo con barra': 0.55, 'Hip thrust': 0.55, 'Cargada colgante': 1.1, 'Sentadilla salto': 1.0, 'Zancadas': 0.6, 'Sentadilla búlgara': 0.6 };
const TYPE_OFF = { fuerza: 0, hipertrofia: 0.1, potencia: 0.25, tecnica: 0.1 };
const BALLISTIC = ['Cargada colgante', 'Sentadilla salto', 'Push press'];

// Una serie con barra (va al sensor): { n, bar: true, s, r, pct, kg, cut, vl, type }.
function lift(n, type, sets, reps, pct, ctx, vl) {
  const base = n === 'Sentadilla salto' ? oneRM('Sentadilla', ctx) : oneRM(n, ctx);
  const kg = base ? Math.max(20, r25(base * pct)) : null;
  const cut = BALLISTIC.includes(n) ? CUT[n] : Math.round(((CUT[n] ?? 0.5) + TYPE_OFF[type]) * 20) / 20;
  return { n, bar: true, type, s: sets, r: reps, pct: Math.round(pct * 100), kg, cut, vl };
}
// Un ejercicio sin sensor (sprints, saltos, prevención): { n, bar: false, x: '3×6', note }.
const extra = (n, x, note = '') => ({ n, bar: false, x, note });

// ── Semana del plan ──
// Pretemporada y fuera de temporada: 3 semanas subiendo y 1 de descarga.
// En temporada: estable, más liviana cada 4 semanas.
export function phase(a, w) {
  const k = w % 4;
  if (k === 3) return { i: 1, deload: true, label: 'Descarga' };
  if (a.season === 'in') return { i: 1, deload: false, label: 'Mantenimiento' };
  const block = Math.floor(w / 4);
  return { i: k, block, deload: false, label: ['Base', 'Carga', 'Intensidad'][k] };
}

// Días de gimnasio en la semana (0 = lunes). Con partido: el día fuerte a las 48 h
// (MD+2), la potencia a 3 días del partido, y nunca el día antes ni el día después.
const STD = { 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 2, 4, 5] };
export function schedule(a, n) {
  if (a.match < 0 || a.match == null) return STD[n] || STD[3];
  const out = [];
  for (const off of [2, 4, 3, 5]) { if (out.length >= n) break; out.push((a.match + off) % 7); }
  return out.sort((x, y) => x - y);
}

// ── Armado ──
export function buildRoutine(a0, profile = {}, ctx = {}, week = 0) {
  const a = normalize(a0, profile);
  const sp = a.mode === 'sport' ? sportOf(a.focus) : null;
  const pos = sp ? sp.pos.find(p => p.id === a.pos) : null;
  const obj = sp ? null : objOf(a.focus);
  const prof = { ...(pos ? pos.prof : obj.prof) };
  const level = profile.level || 'inter', age = +profile.age || 25, bw = +profile.bw || 75;
  const youth = age < 18, older = age >= 50, heavy = bw >= 100;
  const inj = new Set(a.inj);
  const ph = phase(a, week);
  const why = [], warn = [];
  const cx = { ...ctx, loads: profile.loads || ctx.loads || {} };

  // Prioridad → énfasis.
  const pr = a.prio;
  if (['aceleracion', 'velocidad', 'desplazamiento', 'rendimiento'].includes(pr) && prof.spd) prof.spd = 2;
  if (['salto', 'salidas'].includes(pr)) prof.jmp = 2;
  if (['contacto', 'fuerza'].includes(pr)) prof.str = 2;
  if (['lanzamiento', 'remate', 'saque', 'tiro', 'potencia'].includes(pr)) { prof.up = 2; prof.rot = Math.max(prof.rot, 1); }
  const masa = pr === 'masa' || (obj && obj.id === 'hipertrofia');
  const weightClass = sp && sp.id === 'combate';

  // Días: en temporada con partido, 2 sesiones alcanzan para mantener (y mejorar un poco).
  let n = a.days;
  if (sp && a.season === 'in' && n > 2) { warn.push('En temporada te armé 2 sesiones de gimnasio: con partido y cancha, más volumen te llega cansado al fin de semana.'); n = 2; }
  if (sp && a.field >= 4 && n > 3 && a.season !== 'off') { n = 3; warn.push('Con 4 o más entrenamientos de cancha, 3 días de gimnasio es el máximo que te conviene.'); }
  const days = schedule(a, n);

  // Volumen: nivel, tiempo y carga de cancha.
  let sets = level === 'base' ? 3 : level === 'adv' ? 5 : 4;
  if (a.season === 'in') sets = Math.max(2, sets - 2);
  if (sp && a.field >= 4) sets = Math.max(2, sets - 1);
  if (ph.deload) sets = Math.max(2, Math.round(sets * 0.6));
  const maxItems = a.mins === 45 ? 4 : a.mins === 60 ? 5 : 6;
  const vlBy = { fuerza: level === 'base' ? 15 : 20, potencia: 10, hipertrofia: level === 'adv' ? 30 : 25, tecnica: 10 };
  const inSeasonVl = a.season === 'in';

  // Intensidad por semana (pretemporada sube; en temporada se mantiene alta).
  const pick = (arr) => arr[ph.i];
  const bump = (ph.block || 0) * 0.025;
  const capPct = youth || level === 'base' ? 0.85 : 0.9;
  const fp = () => Math.min(capPct, (ph.deload ? 0.72 : a.season === 'in' ? 0.82 : pick([0.75, 0.8, 0.85])) + (ph.deload ? 0 : bump));
  const fr = () => (ph.deload ? 4 : a.season === 'in' ? 3 : pick([5, 4, 3]));
  const hp = () => (ph.deload ? 0.62 : pick([0.67, 0.7, 0.72]));
  const hr = () => (ph.deload ? 8 : pick([10, 8, 8]));

  // Sustituciones por molestias y equipo.
  const olympicOk = a.eq === 'completo' && level !== 'base' && !youth && !inj.has('codo') && !inj.has('espalda') && !older;
  const squatMain = a.eq === 'basico' ? 'Sentadilla búlgara' : inj.has('espalda') ? 'Sentadilla frontal' : 'Sentadilla';
  const hinge = inj.has('espalda') || inj.has('isquios') ? 'Hip thrust' : 'Peso muerto rumano';
  const heavyHinge = inj.has('espalda') ? 'Hip thrust' : 'Peso muerto';
  const pressV = inj.has('hombro') ? null : 'Press militar';
  const pressH = inj.has('hombro') ? 'Press inclinado' : 'Press banca';
  const explosive = olympicOk ? 'Cargada colgante' : 'Sentadilla salto';
  const L = (nm, type, s, r, pct) => lift(nm, type, s, r, pct, cx, inSeasonVl ? Math.min(15, vlBy[type]) : vlBy[type]);

  // Saltos: contactos por sesión según nivel, peso y molestias.
  const plyoOk = !inj.has('rodilla') && !inj.has('tobillo');
  let contacts = level === 'base' ? 30 : level === 'adv' ? 60 : 45;
  if (a.season === 'in') contacts = Math.round(contacts * 0.6);
  if (heavy || older) contacts = Math.round(contacts * 0.7);
  if (ph.deload) contacts = Math.round(contacts * 0.5);
  const jumps = () => {
    if (!plyoOk) return extra('Saltos al cajón (bajás caminando)', '3×3', 'Bajo impacto: tu rodilla o tobillo no reciben el aterrizaje.');
    if (prof.lat >= 2 && prof.jmp < 2) return extra('Saltos laterales', `${Math.max(2, Math.round(contacts / 16))}×6`, 'Aterrizá suave y estable.');
    if (prof.jmp >= 2 && level === 'adv' && !heavy) return extra('Saltos con contramovimiento + al cajón', `${Math.max(3, Math.round(contacts / 12))}×4`, 'Máxima altura, recuperación completa.');
    return extra('Saltos al cajón', `${Math.max(3, Math.round(contacts / 12))}×4`, 'Cada salto al máximo, bajá caminando.');
  };
  const unilateralJumps = () => plyoOk ? extra('Saltos a una pierna', '3×4 por pierna', 'Mejora el salto a una pierna (Liao y col., 2022).') : null;
  const sprints = () => {
    if (!prof.spd || inj.has('isquios') || (sp && ['voley', 'natacion', 'combate'].includes(sp.id))) return null;
    if (sp && sp.id === 'raqueta') return extra('Arranques y frenadas de 3–5 m (con cambio de dirección)', ph.deload ? '4×' : '6×', 'Como en la cancha: split-step, arranque, frenada. Pausa completa.');
    if (a.prio === 'velocidad' || (pos && ['wing', 'extremo', 'velocidad'].includes(pos.id)))
      return extra('Sprints lanzados 20 m (con 20 m de carrera previa)', ph.deload ? '3×' : '4–5×', 'Descanso completo (2–3 min). Si ya hiciste velocidad en la cancha hoy, salteala.');
    return extra('Aceleraciones 10–20 m', ph.deload ? '4×' : '6×', 'Desde parado, a fondo, 90 s de pausa. Si ya hiciste en la cancha hoy, salteala.');
  };

  // Prevención según el deporte (evidencia en knowledge.js).
  const prev = new Set(sp ? sp.prevent : ['core']);
  if (inj.has('isquios')) prev.add('nordic');
  if (inj.has('ingle')) prev.add('copenhagen');
  if (inj.has('hombro')) prev.add('shoulder');
  if (inj.has('tobillo')) prev.add('ankle');
  const nordicDose = ph.deload ? '2×4' : a.season === 'in' ? '2×5' : ['2×5', '3×6', '3×8'][ph.i];
  const PREV = {
    nordic: () => extra('Nórdicos', inj.has('isquios') ? '2×3 (bajá solo lo que controles)' : nordicDose, 'Bajan a la mitad los desgarros de isquios (van Dyk y col., 2019).'),
    copenhagen: () => extra('Copenhagen (aductores)', a.season === 'in' ? '1×6 por lado' : '2×6–10 por lado', 'Menos problemas de ingle en fútbol (Harøy y col., 2019). Empezá con la rodilla apoyada.'),
    shoulder: () => extra('Rotación externa con banda + Y-T-W', '2×12', 'Programa de hombro para lanzadores: −28 % de problemas (Andersson y col., 2017).'),
    neck: () => extra('Isometría de cuello en 4 direcciones', prof.neck >= 2 ? '3×10 s por lado' : '2×10 s por lado', 'Cuello fuerte para el contacto. Presión suave con la mano, sin dolor.'),
    ankle: () => extra('Equilibrio a una pierna + pantorrillas', '3×30 s y 3×12', 'Tobillos estables para aterrizar y cambiar de dirección.'),
    landing: () => extra('Aterrizajes controlados', '3×5', 'Caé suave, rodillas alineadas con los pies.'),
    core: () => extra(prof.rot >= 2 ? 'Pallof press (anti-rotación)' : 'Plancha lateral', prof.rot >= 2 ? '3×10 por lado' : '3×30 s por lado', '')
  };

  // Plantillas de sesión (ejercicios con barra primero en su orden lógico).
  const S = {
    infF: () => ({ name: 'Fuerza de piernas', items: [L(squatMain, 'fuerza', sets, fr(), fp()), L(hinge === 'Hip thrust' ? 'Hip thrust' : heavyHinge, 'fuerza', Math.max(2, sets - 1), fr(), fp() - 0.05), inj.has('rodilla') ? null : L(a.eq === 'basico' ? 'Zancadas' : 'Sentadilla búlgara', 'fuerza', 3, 6, 0.7)] }),
    supF: () => ({ name: 'Fuerza de tren superior', items: [L(pressH, 'fuerza', sets, fr(), fp()), L('Remo con barra', 'fuerza', Math.max(2, sets - 1), fr() + 1, fp() - 0.05), extra('Dominadas' + (level === 'base' ? '' : ' con lastre'), `${Math.max(2, sets - 1)}×${level === 'base' ? '5–8' : '4–6'}`), pressV && prof.up >= 1 ? L(pressV, 'fuerza', 3, 5, fp() - 0.07) : null] }),
    infP: () => ({ name: 'Potencia de piernas', items: [sprints(), jumps(), L(explosive, 'potencia', sets, 3, explosive === 'Cargada colgante' ? pick([0.7, 0.75, 0.8]) : pick([0.2, 0.25, 0.3])), L('Hip thrust', 'potencia', 3, 5, 0.55), prof.jmp >= 2 || prof.lat >= 2 ? unilateralJumps() : null] }),
    supP: () => ({ name: 'Potencia de tren superior', items: [prof.up >= 2 || prof.rot >= 2 ? extra(prof.rot >= 2 ? 'Lanzamiento rotacional con balón medicinal' : 'Lanzamiento de balón medicinal por arriba', prof.rot >= 2 ? '4×4 por lado' : '4×5', 'A máxima velocidad (Deng y col., 2024: el trabajo multimodal mejora el saque).') : null, L(pressH, 'potencia', sets, 3, pick([0.4, 0.45, 0.5])), pressV && !inj.has('hombro') ? L('Push press', 'potencia', 3, 3, 0.6) : null, L('Remo con barra', 'potencia', 3, 5, 0.5)] }),
    compF: () => ({ name: 'Fuerza completa', items: [L(squatMain, 'fuerza', sets, fr(), fp()), L(pressH, 'fuerza', sets, fr(), fp()), L(hinge === 'Hip thrust' ? 'Hip thrust' : heavyHinge, 'fuerza', Math.max(2, sets - 1), fr(), fp() - 0.05), L('Remo con barra', 'fuerza', Math.max(2, sets - 1), fr() + 1, fp() - 0.05)] }),
    compP: () => ({ name: 'Potencia completa', items: [sprints(), jumps(), L(explosive, 'potencia', sets, 3, explosive === 'Cargada colgante' ? pick([0.7, 0.75, 0.8]) : pick([0.2, 0.25, 0.3])), L(pressH, 'potencia', 3, 3, pick([0.4, 0.45, 0.5])), prof.up >= 2 || prof.rot >= 2 ? extra(prof.rot >= 2 ? 'Lanzamiento rotacional con balón medicinal' : 'Lanzamiento de balón medicinal por arriba', '3×4', 'A máxima velocidad.') : L('Hip thrust', 'potencia', 3, 5, 0.55)] }),
    infH: () => ({ name: 'Piernas (masa)', items: [L(squatMain, 'hipertrofia', sets, hr(), hp()), L(hinge, 'hipertrofia', Math.max(3, sets - 1), hr(), hp()), inj.has('rodilla') ? null : L('Zancadas', 'hipertrofia', 3, 10, 0.55), L('Hip thrust', 'hipertrofia', 3, 10, hp())] }),
    supH: () => ({ name: 'Tren superior (masa)', items: [L(pressH, 'hipertrofia', sets, hr(), hp()), L('Remo con barra', 'hipertrofia', sets, hr(), hp()), pressV ? L(pressV, 'hipertrofia', 3, 10, hp() - 0.05) : L('Press inclinado', 'hipertrofia', 3, 10, hp()), extra('Dominadas', `3×${level === 'base' ? '6–8' : '8–10'}`)] }),
    speed: () => ({ name: 'Velocidad', items: [sprints() || extra('Aceleraciones 10–20 m', '6×', 'Descanso completo.'), jumps(), unilateralJumps(), L(explosive, 'potencia', 3, 2, explosive === 'Cargada colgante' ? 0.7 : 0.25)] })
  };

  // Qué sesiones van, según días y énfasis.
  let plan;
  const powerFirst = prof.spd >= 2 || prof.jmp >= 2;
  if (n === 2) plan = masa && a.season !== 'in' ? ['compF', 'supH'] : ['compF', 'compP'];
  else if (n === 3) plan = masa ? ['infH', 'supH', 'compF'] : powerFirst ? ['infF', 'supF', 'infP'] : prof.up >= 2 ? ['infF', 'supP', 'compF'] : ['infF', 'supF', 'compP'];
  else if (n === 4) plan = masa ? ['infH', 'supH', 'infF', 'supF'] : ['infF', 'supF', 'infP', 'supP'];
  else plan = masa ? ['infH', 'supH', 'infF', 'supF', 'compP'] : ['infF', 'supF', 'infP', 'supP', prof.spd >= 2 ? 'speed' : 'supH'];
  if (sp && sp.id === 'natacion') plan = plan.map(k => (k === 'infF' ? 'supF' : k === 'supF' ? 'infF' : k)); // tracción primero
  if (sp && sp.id === 'atletismo' && pos.id === 'fondo') plan = plan.map(k => (k === 'infP' || k === 'supP' ? 'compF' : k === 'supH' || k === 'infH' ? 'compF' : k));

  // Prevención repartida en la semana, con la dosis de los estudios: nórdicos y Copenhagen
  // 2 veces en pretemporada y 1 en temporada; cuello, tobillo y aterrizajes 2; core 1–2.
  // El programa de hombro va en la entrada en calor de todas las sesiones (así se hizo
  // en Andersson y col., 2017). Como mucho 2 ejercicios de prevención por sesión.
  const built = plan.map(k => ({ k, ...S[k]() }));
  const FREQ = { nordic: a.season === 'in' ? 1 : 2, copenhagen: a.season === 'in' ? 1 : 2, neck: prof.neck >= 2 ? 3 : 2, ankle: 2, landing: 2, core: n >= 4 ? 2 : 1 };
  const PREFER = { nordic: ['infF', 'compF', 'infH', 'infP', 'compP', 'speed'], copenhagen: ['infP', 'compP', 'infF', 'compF', 'speed'], landing: ['infP', 'compP', 'speed', 'infF'], ankle: ['infP', 'compP', 'supF', 'supP', 'infF'], neck: ['supF', 'supP', 'supH', 'compF', 'compP', 'infF'], core: ['supF', 'supP', 'supH', 'compP', 'infH'] };
  const ORDER = ['nordic', 'copenhagen', 'neck', 'landing', 'ankle', 'core']; // de más a menos importante
  const prevAt = built.map(() => []);
  for (const p of ORDER) {
    if (!prev.has(p)) continue;
    const cand = built.map((s, i) => i).sort((x, y) => {
      const r = t => { const j = (PREFER[p] || []).indexOf(built[t].k); return j < 0 ? 99 : j; };
      return r(x) - r(y) || x - y;
    });
    let left = Math.min(FREQ[p] || 1, n);
    for (const i of cand) { if (!left) break; if (prevAt[i].length >= 2) continue; prevAt[i].push(p); left--; }
  }
  const acc = ph.deload ? 2 : 3;
  const sessions = built.map((s, i) => {
    let items = s.items.filter(Boolean).map(x => (x.bar && x.s === 3 && ph.deload ? { ...x, s: acc } : x));
    for (const p of prevAt[i]) items.push(PREV[p]());
    // Recorte por tiempo: sale primero la prevención menos importante y después el
    // último accesorio con barra; el ejercicio principal nunca.
    while (items.length > maxItems) {
      const pv = items.map((x, j) => ({ x, j })).filter(o => !o.x.bar && /Plancha|Pallof|Equilibrio|Aterrizajes|cuello/.test(o.x.n)).pop();
      if (pv) { items.splice(pv.j, 1); continue; }
      const bars = items.map((x, j) => (x.bar ? j : -1)).filter(j => j >= 0);
      if (bars.length > 1) { items.splice(bars[bars.length - 1], 1); continue; }
      items.pop();
    }
    const warm = extra('Entrada en calor', '8–10 min', 'Movilidad y activación, después series de aproximación (40 · 60 · 80 %) que ya te muestran la velocidad del día.' + (prev.has('shoulder') ? ' Sumá rotación externa con banda + Y-T-W 2×12: 28 % menos problemas de hombro en lanzadores (Andersson y col., 2017).' : ''));
    return { dow: days[i], name: s.name, items: [warm, ...items] };
  });

  // Por qué (reglas, lenguaje simple). Nova después lo explica con más detalle.
  if (sp) {
    why.push(`${sp.t}, ${pos.t.toLowerCase()}: más énfasis en ${[prof.str >= 2 && 'fuerza', prof.spd >= 2 && 'velocidad', prof.jmp >= 2 && 'salto', prof.up >= 2 && 'tren superior', prof.rot >= 2 && 'rotación', prof.neck >= 2 && 'cuello y contacto'].filter(Boolean).join(', ') || 'fuerza general'}.`);
    if (a.match >= 0) why.push(`Jugás el ${DOW_LONG[a.match]}: la sesión fuerte va a las 48 h del partido y nada pesado el día antes.`);
    why.push(a.season === 'in' ? 'En temporada: poco volumen y cargas altas, para mantener la fuerza y llegar fresco.' : a.season === 'pre' ? 'Pretemporada: 3 semanas subiendo la carga y 1 de descarga.' : 'Fuera de temporada: es el momento de construir fuerza' + (masa ? ' y masa.' : '.'));
  } else why.push(`${obj.t}: ${obj.id === 'hipertrofia' ? 'series de 8–10 reps cerca del fallo, cortando al 25–30 % de pérdida.' : obj.id === 'potencia' ? 'cargas livianas a máxima velocidad, cortando al 10 %.' : obj.id === 'fuerza' ? 'cargas pesadas, pocas reps, cortando al 15–20 % de pérdida.' : 'fuerza de todo el cuerpo con volumen moderado.'}`);
  if (prev.has('nordic')) why.push('Nórdicos 1–2 veces por semana: la mitad de desgarros de isquios.');
  if (prev.has('copenhagen')) why.push('Copenhagen para la ingle: 41 % menos problemas en futbolistas.');
  if (prev.has('shoulder')) why.push('Programa de hombro: 28 % menos problemas en lanzadores.');
  if (inj.size) warn.push('Cambié ejercicios por tus molestias. Si duele al entrenar, pará ese ejercicio y consultá a un médico o fisioterapeuta.');
  if (youth) warn.push('Sos menor de 18: cargas hasta 85 %, sin máximos y con alguien que te supervise la técnica.');
  if (weightClass && pr !== 'masa') why.push('Deporte con categorías: fuerza y potencia sin buscar masa (poco volumen, cortes de velocidad bajos).');
  if (sessions.some(s => s.items.some(x => x.bar && x.kg == null))) warn.push('Algunos ejercicios no tienen carga todavía: arrancá liviano y subí hasta salir en la zona de velocidad. Con tus primeras series, Nova calcula los kilos.');

  const title = sp ? `${sp.t} · ${pos.t}` : obj.t;
  const sub = `${a.weeks} semanas · ${n} días${sp ? ' · ' + SEASONS.find(([v]) => v === a.season)[1].toLowerCase() : ''}`;
  return { a, title, sub, week, weeks: a.weeks, phase: ph, days: sessions, why, warn };
}

// Semana del plan en la que cae `now` (0 a weeks-1; después del final, la última).
export const weekOf = (start, weeks, now = Date.now()) => clamp(Math.floor((now - (start || now)) / (7 * DAY)), 0, (weeks || 6) - 1);

// Sesión de hoy o, si hoy no hay gimnasio, la próxima. { ...sesión, today, dow }.
export function sessionFor(r, now = Date.now()) {
  const dow = (new Date(now).getDay() + 6) % 7;
  const today = r.days.find(d => d.dow === dow);
  if (today) return { ...today, today: true };
  const next = r.days.find(d => d.dow > dow) || r.days[0];
  return { ...next, today: false };
}

// Texto de una línea para cada ejercicio (lista y plan).
export const lineOf = (x, unit = 'kg') => x.bar
  ? `${x.s}×${x.r}${x.kg ? ' · ' + String(x.kg).replace('.', ',') + ' ' + unit : ' · ' + x.pct + ' %'} · corte ${String(x.cut.toFixed(2)).replace('.', ',')} m/s`
  : x.x;

// Resumen compacto para Nova (< 1000 caracteres).
export function summary(r, profile = {}) {
  const a = r.a, sp = a.mode === 'sport' ? sportOf(a.focus) : null;
  const head = [r.title, sp ? SEASONS.find(([v]) => v === a.season)[1] : null, a.match >= 0 ? 'partido ' + DOW_LONG[a.match] : null,
    sp ? a.field + ' entrenamientos de cancha' : null, r.days.length + ' días de gimnasio de ' + a.mins + ' min',
    sp ? 'prioridad: ' + sp.prio.find(([v]) => v === a.prio)[1].toLowerCase() : null,
    a.inj.length ? 'molestias: ' + a.inj.join(', ') : 'sin molestias', 'nivel ' + (profile.level || 'inter'), (profile.age ? profile.age + ' años' : null)].filter(Boolean).join(' · ');
  const days = r.days.map(d => `${DOW[d.dow]} ${d.name}: ${d.items.map(x => x.bar ? `${x.n} ${x.s}×${x.r}` : x.n).join(', ')}`).join('. ');
  return (head + '. ' + days).slice(0, 980);
}

// ── Rutina personalizada (la arma el atleta) ──
// { kind: 'custom', id, name, weeks, plan: [{ dow, name, items: [{ n, s, r }] }] }.
// El atleta elige ejercicios, series y reps; la app pone la carga (desde el 1RM medido
// o el perfil), el corte de velocidad y la progresión: 3 semanas subiendo y 1 de descarga.
export const CATALOG = ['Sentadilla', 'Sentadilla frontal', 'Peso muerto', 'Peso muerto rumano', 'Hip thrust', 'Zancadas', 'Sentadilla búlgara',
  'Press banca', 'Press inclinado', 'Press militar', 'Push press', 'Remo con barra', 'Cargada colgante', 'Sentadilla salto'];
// % del 1RM para hacer esas reps dejando 1–2 en reserva (no al fallo).
const PCT_REPS = { 1: 0.9, 2: 0.87, 3: 0.84, 4: 0.81, 5: 0.78, 6: 0.76, 8: 0.72, 10: 0.67, 12: 0.63, 15: 0.58 };
const pctFor = r => { const ks = Object.keys(PCT_REPS).map(Number); const k = ks.reduce((b, x) => (Math.abs(x - r) < Math.abs(b - r) ? x : b), ks[0]); return PCT_REPS[k]; };

export function buildCustom(r, profile = {}, ctx = {}, week = 0) {
  const cx = { ...ctx, loads: profile.loads || ctx.loads || {} };
  const weeks = [4, 6, 8].includes(+r.weeks) ? +r.weeks : 6;
  const ph = phase({ season: 'off' }, week);
  const youth = (+profile.age || 25) < 18;
  const days = (r.plan || []).filter(d => d && (d.items || []).length).slice(0, 7).map(d => ({
    dow: clamp(+d.dow || 0, 0, 6), name: String(d.name || 'Entrenamiento').slice(0, 40),
    items: [extra('Entrada en calor', '8–10 min', 'Movilidad y series de aproximación (40 · 60 · 80 %) que ya te muestran la velocidad del día.'),
      ...(d.items || []).slice(0, 8).map(x => {
        const reps = clamp(+x.r || 5, 1, 15), sets = clamp(+x.s || 3, 1, 8);
        const ballistic = BALLISTIC.includes(x.n);
        const type = ballistic ? 'potencia' : reps <= 5 ? 'fuerza' : 'hipertrofia';
        let pct = ballistic ? (x.n === 'Sentadilla salto' ? 0.25 : 0.7) : pctFor(reps) + (ph.deload ? -0.1 : [-0.025, 0, 0.025][ph.i] || 0);
        if (youth) pct = Math.min(pct, 0.85);
        return lift(x.n, type, ph.deload ? Math.max(1, Math.round(sets * 0.6)) : sets, reps, pct, cx, type === 'potencia' ? 10 : type === 'fuerza' ? 20 : 25);
      })]
  })).sort((x, y) => x.dow - y.dow);
  const warn = youth ? ['Sos menor de 18: cargas hasta 85 % y con alguien que te supervise la técnica.'] : [];
  if (days.some(d => d.items.some(x => x.bar && x.kg == null))) warn.push('Algunos ejercicios no tienen carga todavía: arrancá liviano y subí hasta salir en la zona de velocidad.');
  return { a: { mode: 'custom', weeks }, custom: true, title: String(r.name || 'Mi rutina').slice(0, 40), sub: `${weeks} semanas · ${days.length} días · personalizada`,
    week, weeks, phase: ph, days, why: ['Rutina tuya: vos elegís ejercicios, series y reps; BOOST pone la carga y el corte de velocidad y la sube cada semana, con una de descarga cada 4.'], warn };
}
