/* ============================================================
   config.js — los ajustes del sensor, en palabras.

   `params.js` trae los rangos, generados desde el firmware. Acá va lo que un
   humano necesita para no romper nada: cómo se llama cada cosa, en qué unidad
   está y qué pasa si se toca.

   El orden y los grupos son deliberados: arriba lo que se calibra en el
   gimnasio con la barra en la mano, abajo lo que casi nunca se toca. Los que
   pueden dejar el sensor sin contar repeticiones están marcados.
   ============================================================ */

import { PARAMS, PARAM_POR_NOMBRE } from './params.js';

/* factor: cuánto vale una cuenta en la unidad que se muestra. El sensor
   habla en enteros (mg, mm, ms) porque no hay float en el protocolo; acá se
   traduce a lo que uno diría en voz alta. */
const TEXTOS = {
  TAP_THS: {
    label: 'Sensibilidad del doble toque',
    ayuda: 'Más bajo = más sensible. Si el sensor se despierta solo al cargar ' +
      'discos, subilo. Si hay que golpear fuerte para que despierte, bajalo.',
    unidad: 'niveles', paso: 1,
  },
  TAP_SHOCK: {
    label: 'Duración de cada golpe',
    ayuda: 'Cuánto puede durar cada toque. Con la carcasa puesta el golpe se ' +
      'transmite más lento que sobre la placa pelada.',
    unidad: '', paso: 1,
  },
  TAP_QUIET: {
    label: 'Silencio entre golpes',
    ayuda: 'Cuánta quietud exige después de cada toque antes de escuchar el ' +
      'siguiente. Subilo si un solo golpe se cuenta como dos.',
    unidad: '', paso: 1,
  },
  TAP_DUR: {
    label: 'Ventana del doble toque',
    ayuda: 'Cuánto tiempo hay entre el primer y el segundo golpe. Subilo si ' +
      'no llegás a dar los dos toques a tiempo.',
    unidad: '', paso: 1,
  },

  ZUPT_ACC_TOL_MG: {
    label: 'Tolerancia de quietud (acelerómetro)',
    ayuda: 'Qué tan quieta tiene que estar la barra para que el sensor la dé ' +
      'por detenida y corrija su deriva. Es el parámetro más delicado de todos.',
    unidad: 'mg', paso: 5, critico: true,
  },
  ZUPT_GYR_TOL_MDPS: {
    label: 'Tolerancia de quietud (giroscopio)',
    ayuda: 'Lo mismo que el anterior, pero para el giro de la barra.',
    unidad: 'mdps', paso: 100, critico: true,
  },
  REP_MIN_ROM_MM: {
    label: 'Recorrido mínimo',
    ayuda: 'Un movimiento más corto que esto no cuenta como repetición. Subilo ' +
      'si acomodar la barra suma reps fantasma.',
    unidad: 'mm', paso: 10, critico: true,
  },
  REP_MAX_ROM_MM: {
    label: 'Recorrido máximo',
    ayuda: 'Más largo que esto se descarta. Bajarlo demasiado corta las ' +
      'sentadillas profundas.',
    unidad: 'mm', paso: 10, critico: true,
  },
  REP_MIN_DUR_MS: {
    label: 'Duración mínima',
    ayuda: 'Una repetición más rápida que esto se descarta por ruido.',
    unidad: 'ms', paso: 10, critico: true,
  },
  REP_MAX_DUR_MS: {
    label: 'Duración máxima',
    ayuda: 'Más lenta que esto no se cuenta. Subilo si hacés repeticiones ' +
      'muy pesadas y lentas que no aparecen.',
    unidad: 'ms', paso: 100, critico: true,
  },

  SET_END_TIMEOUT_S: {
    label: 'Cierre automático de la serie',
    ayuda: 'Sin movimiento por este tiempo, la serie se cierra sola.',
    unidad: 's', paso: 1,
  },
  CALIB_MIN_MS: {
    label: 'Quietud para calibrar',
    ayuda: 'Cuánto tiene que estar quieta la barra antes de la primera ' +
      'repetición para que el sensor mida su propio offset.',
    unidad: 'ms', paso: 100,
  },
  SLEEP_TIMEOUT_S: {
    label: 'Dormirse tras',
    ayuda: 'Inactividad antes de entrar en reposo profundo.',
    unidad: 's', paso: 30,
  },
  WAKE_THS_MG: {
    label: 'Umbral para despertar',
    ayuda: 'Cuánto movimiento hace falta para que se despierte. Bajarlo mucho ' +
      'hace que se despierte en el bolso y gaste batería.',
    unidad: 'mg', paso: 125,
  },
  WAKE_DUR_MS: {
    label: 'Movimiento sostenido para despertar',
    ayuda: 'Cuánto tiene que durar ese movimiento. Sube el umbral contra los ' +
      'golpes sueltos del bolso.',
    unidad: 'ms', paso: 100,
  },
  ADV_WINDOW_MIN: {
    label: 'Ventana de conexión',
    ayuda: 'Cuánto tiempo se deja ver por Bluetooth antes de rendirse.',
    unidad: 'min', paso: 30,
  },
  TRAVEL_TIMEOUT_M: {
    label: 'Modo viaje',
    ayuda: 'Quieto tanto tiempo, se apaga del todo. Pensado para que un envío ' +
      'de semanas no llegue con la batería vacía.',
    unidad: 'min', paso: 1440,
  },
  LED_BRIGHTNESS: {
    label: 'Brillo del LED',
    ayuda: 'Bajarlo alarga la batería un poco y molesta menos de noche.',
    unidad: '%', paso: 5,
  },

  ODR_HZ: { label: 'Frecuencia de muestreo', ayuda: '', unidad: 'Hz' },
  ACCEL_FS_G: { label: 'Escala del acelerómetro', ayuda: '', unidad: 'g' },
  GYRO_FS_DPS: { label: 'Escala del giroscopio', ayuda: '', unidad: 'dps' },
  ODR_CALIB_PPM: { label: 'Corrección del reloj', ayuda: '', unidad: 'ppm' },
};

/* Los grupos, en el orden en que se muestran. Primero lo que se toca en el
   gimnasio; los de solo lectura al final, porque son referencia y no ajuste. */
export const GRUPOS = [
  {
    id: 'tap',
    titulo: 'Doble toque',
    intro: 'Estos cuatro se calibran con la carcasa puesta. Sin carcasa los ' +
      'valores no significan nada: el plástico cambia cómo se transmite el golpe.',
    params: ['TAP_THS', 'TAP_SHOCK', 'TAP_QUIET', 'TAP_DUR'],
  },
  {
    id: 'conteo',
    titulo: 'Detección de repeticiones',
    intro: 'Lo que decide qué cuenta como repetición y qué no. Es donde más ' +
      'se gana y donde más fácil se rompe.',
    params: ['ZUPT_ACC_TOL_MG', 'ZUPT_GYR_TOL_MDPS', 'REP_MIN_ROM_MM',
             'REP_MAX_ROM_MM', 'REP_MIN_DUR_MS', 'REP_MAX_DUR_MS'],
  },
  {
    id: 'serie',
    titulo: 'Series y calibración',
    intro: '',
    params: ['SET_END_TIMEOUT_S', 'CALIB_MIN_MS'],
  },
  {
    id: 'energia',
    titulo: 'Energía',
    intro: 'Cuánto dura la batería depende sobre todo de acá.',
    params: ['SLEEP_TIMEOUT_S', 'WAKE_THS_MG', 'WAKE_DUR_MS', 'ADV_WINDOW_MIN',
             'TRAVEL_TIMEOUT_M', 'LED_BRIGHTNESS'],
  },
  {
    id: 'fijos',
    titulo: 'Fijos',
    intro: 'No se pueden cambiar en caliente: hay que reconfigurar el chip y ' +
      'tirar el búfer en medio de una serie, y además dejaría inválidas las ' +
      'escalas ya escritas en las grabaciones. Se muestran para saber contra ' +
      'qué se está midiendo.',
    params: ['ODR_HZ', 'ACCEL_FS_G', 'GYRO_FS_DPS', 'ODR_CALIB_PPM'],
  },
];

/** Un parámetro con todo junto: rango del firmware + texto para humanos. */
export function ajuste(nombre) {
  const spec = PARAM_POR_NOMBRE.get(nombre);
  if (!spec) throw new Error(`parámetro desconocido: ${nombre}`);
  return { ...spec, ...(TEXTOS[nombre] || { label: nombre, ayuda: '', unidad: '' }) };
}

/* Que ningún parámetro del firmware quede sin texto. Si alguien agrega una
   fila a la tabla y regenera params.js, esto lo dice en la consola en vez de
   mostrar un identificador en mayúsculas en medio de la pantalla. */
export const SIN_TEXTO = PARAMS.filter((p) => !TEXTOS[p.nombre]).map((p) => p.nombre);

/* Y que ningún grupo se olvide de un parámetro: un ajuste que existe pero no
   está en ninguna sección sería invisible. */
const EN_GRUPOS = new Set(GRUPOS.flatMap((g) => g.params));
export const SIN_GRUPO = PARAMS.filter((p) => !EN_GRUPOS.has(p.nombre)).map((p) => p.nombre);
