/* ============================================================
   gen_config_js.mjs — genera app/js/params.js desde protocol.h.

   POR QUE: la tabla de parametros existe en tres lados (el header del
   firmware, la app y PROTOCOL.md). Copiarla a mano garantiza que en algun
   momento se separen, y el sintoma seria feo: la app ofreciendo un rango que
   el sensor rechaza, o peor, aceptando uno que lo deja inutil.

   El firmware manda. Esto lee VBT_PARAM_SPECS y escribe el espejo.

       node tools/gen_config_js.mjs

   Los textos para humanos (nombre, unidad, ayuda) NO salen de aca: viven en
   app/js/config.js, que importa esto. Un comentario en C no es lugar para la
   copy de una interfaz.
   ============================================================ */

import { readFileSync, writeFileSync } from 'node:fs';

const H = '../firmware/src/ble/protocol.h';
const SALIDA = '../app/js/params.js';

const fuente = readFileSync(H, 'utf8');

/* Los param_id son constantes del enum; hay que resolverlas para poder
   escribir numeros en el JS. */
const ids = {};
for (const m of fuente.matchAll(/(VBT_P_[A-Z0-9_]+)\s*=\s*(0x[0-9A-Fa-f]+)/g)) {
  ids[m[1]] = parseInt(m[2], 16);
}

const TIPOS = { VBT_PARAM_TYPE_U8: 0, VBT_PARAM_TYPE_U16: 1, VBT_PARAM_TYPE_I16: 2,
                VBT_PARAM_TYPE_U32: 3, VBT_PARAM_TYPE_F32: 4 };

const bloque = fuente.match(/VBT_PARAM_SPECS\[\]\s*=\s*\{([\s\S]*?)\n\};/);
if (!bloque) throw new Error('no encontre VBT_PARAM_SPECS en ' + H);

const filas = [];
for (const linea of bloque[1].split('\n')) {
  const m = linea.match(/^\s*\{(VBT_P_[A-Z0-9_]+),\s*(VBT_PARAM_TYPE_[A-Z0-9]+),\s*(-?\d+),\s*(-?\d+),\s*(-?\d+),\s*(\d)\}/);
  if (!m) continue;
  const [, idName, tipoName, min, max, def, esc] = m;
  if (!(idName in ids)) throw new Error(`param_id desconocido: ${idName}`);
  if (!(tipoName in TIPOS)) throw new Error(`tipo desconocido: ${tipoName}`);
  filas.push({ nombre: idName.replace('VBT_P_', ''), id: ids[idName],
               tipo: TIPOS[tipoName], min: +min, max: +max, def: +def,
               escribible: esc === '1' });
}
if (filas.length === 0) throw new Error('la tabla salio vacia');

const js = `/* ============================================================
   params.js — GENERADO. No editar a mano.

   Espejo de VBT_PARAM_SPECS en firmware/src/ble/protocol.h. Se regenera con:

       node tools/gen_config_js.mjs

   El firmware es la fuente de verdad y el unico control real: valida cada
   escritura contra estos mismos rangos. Lo de aca sirve para que la interfaz
   no ofrezca valores que el sensor va a rechazar.

   Los textos para humanos estan en config.js, no aca.
   ============================================================ */

export const PARAMS = ${JSON.stringify(filas, null, 2).replace(/"([a-z]+)":/g, '$1:')};

export const PARAM_POR_ID = new Map(PARAMS.map((p) => [p.id, p]));
export const PARAM_POR_NOMBRE = new Map(PARAMS.map((p) => [p.nombre, p]));
`;

writeFileSync(SALIDA, js);
console.log(`${filas.length} parametros -> ${SALIDA}`);
