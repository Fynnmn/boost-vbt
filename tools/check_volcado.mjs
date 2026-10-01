/* ============================================================
   check_volcado.mjs — verifica la cadena completa de la descarga del log.

   POR QUE: el volcado atraviesa cuatro capas — el firmware arma lotes, BLE
   los entrega, la app los reensambla y escribe un `.vbt`, y `replay.exe` lo
   lee. Cada capa por separado tiene sus tests; lo que nadie prueba es que
   encajen. Y el modo de falla es el peor: un archivo que se abre sin error y
   tiene los datos corridos.

   Corre el simulador contra la app de verdad (sim.js -> sensor.js), escribe
   el archivo y lo verifica. No pide hardware.

       node tools/check_volcado.mjs

   Lo que NO cubre: el firmware real. Eso lo cubre test_log_dumper.cpp, que
   corre la misma logica contra una flash y un stack falsos.
   ============================================================ */

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { SimSensor } from '../app/js/sim.js';
import { Sensor } from '../app/js/sensor.js';

const SALIDA = '../firmware/test/fixtures';
const REPLAY = '../firmware/build/replay.exe';

let fallas = 0;
const check = (cond, msg) => {
  console.log(`  ${cond ? 'ok ' : 'MAL'}  ${msg}`);
  if (!cond) fallas++;
};

/* --- Descarga completa --------------------------------------------------- */

console.log('Descarga completa');
const s = new Sensor(new SimSensor());
await s.connect();

const sesiones = await s.listarSesiones();
check(sesiones.length === 3, `se enumeran las sesiones (${sesiones.length})`);
check(sesiones[2].muestras === 0xffffffff,
  'la sesion abierta se reporta como abierta');

const r = await s.descargarSesion(0);
check(r.completo, 'la descarga se reporta completa');
check(r.perdidos === 0 && r.malos === 0, 'sin lotes perdidos ni ilegibles');
check(r.recibidas === r.declarado,
  `lo recibido coincide con lo declarado (${r.recibidas}/${r.declarado})`);

const bytes = new Uint8Array(await r.blob.arrayBuffer());
const esperado = 32 + r.recibidas * 12;
check(bytes.length === esperado,
  `tamano ${bytes.length} B, esperado ${esperado} (32 de header + 12 por muestra)`);
check(String.fromCharCode(...bytes.slice(0, 4)) === 'VBT1', 'magic VBT1');

const dv = new DataView(bytes.buffer);
check(dv.getUint32(12, true) === r.recibidas,
  'el sample_count del header describe el contenido real del archivo');
check(dv.getUint8(22) === 0, 'origen 0 = sensor real');

/* Las muestras del simulador son una senoide: si llegaran mezcladas o
   corridas, el eje Z no oscilaria alrededor de 1 g. */
let min = 32767, max = -32768;
for (let i = 0; i < r.recibidas; i++) {
  const az = dv.getInt16(32 + i * 12 + 4, true);
  if (az < min) min = az;
  if (az > max) max = az;
}
check(min < 3200 && max > 5000,
  `el eje Z oscila (${min}..${max}), o sea que las muestras no se corrieron`);

mkdirSync(SALIDA, { recursive: true });
writeFileSync(`${SALIDA}/volcado.vbt`, Buffer.from(bytes));

/* --- Descarga con un lote perdido ---------------------------------------- */

console.log('\nDescarga con un lote perdido');
const t2 = new SimSensor();
const emitirOriginal = t2._emit.bind(t2);
let n = 0;
t2._emit = (tipo, detail) => {
  // Se tira un lote del medio, como hace BLE cuando el sensor se aleja.
  if (tipo === 'bytes' && detail.char === 'logdump' && ++n === 40) return;
  emitirOriginal(tipo, detail);
};
const s2 = new Sensor(t2);
await s2.connect();
const r2 = await s2.descargarSesion(0);

check(!r2.completo, 'la descarga NO se reporta completa');
check(r2.perdidos > 0, `se detectan los lotes perdidos (${r2.perdidos})`);
check(r2.recibidas < r2.declarado,
  `llegaron menos de las declaradas (${r2.recibidas} < ${r2.declarado})`);

const bytes2 = new Uint8Array(await r2.blob.arrayBuffer());
const dv2 = new DataView(bytes2.buffer);
// Lo que importa: el archivo no puede mentir sobre si mismo. Un header que
// declara mas muestras de las que hay hace que toda herramienta lea de mas.
check(dv2.getUint32(12, true) === r2.recibidas,
  'el header se corrigio a lo que de verdad hay en el archivo');
check(bytes2.length === 32 + r2.recibidas * 12,
  'el tamano concuerda con el header corregido');

const meta = JSON.parse(await s2.metadataDeVolcado(r2).text());
check(meta.descarga_completa === false, 'el .json marca la descarga incompleta');
check(meta.muestras_declaradas_por_el_sensor === r2.declarado,
  'el .json conserva cuantas dijo el sensor');

writeFileSync(`${SALIDA}/volcado_incompleto.vbt`, Buffer.from(bytes2));

/* --- Que replay.exe los lea de verdad ------------------------------------ */

console.log('\nLectura con replay.exe');
if (!existsSync(REPLAY)) {
  console.log('  (replay.exe no esta compilado, se saltea: make test)');
} else {
  for (const [archivo, muestras] of [['volcado.vbt', r.recibidas],
                                     ['volcado_incompleto.vbt', r2.recibidas]]) {
    const salida = execFileSync(REPLAY, [`test/fixtures/${archivo}`, '--json'],
                                { cwd: '../firmware', encoding: 'utf8' });
    const j = JSON.parse(salida);
    check(j.muestras === muestras, `${archivo}: replay lee ${j.muestras} muestras`);
    check(j.odr_hz === 208, `${archivo}: 208 Hz`);
    check(j.origen_nombre === 'sensor real', `${archivo}: origen "sensor real"`);
    // Ninguno de los dos puede salir marcado como truncado: el header de cada
    // uno describe su propio contenido, aunque a uno le falten datos del medio.
    check(!j.truncado, `${archivo}: el header no se contradice con el contenido`);
  }
}

await s.disconnect();
await s2.disconnect();

console.log();
if (fallas) {
  console.error(`FALLA: ${fallas} comprobacion(es) de la cadena del volcado`);
  process.exit(1);
}
console.log('OK: la cadena del volcado funciona de punta a punta');
