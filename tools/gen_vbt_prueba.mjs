/* ============================================================
   gen_vbt_prueba.mjs — regenera el fixture del formato `.vbt`.

   Importa el `imu.js` DE LA APP, sin copiar una linea: si los offsets del
   header se corren, se corren aca tambien y `replay.exe` lo canta. Un
   `.vbt` con el header desalineado no da error, da basura silenciosa —
   por eso esto existe.

   No genera dataset. La senal es una senoide inventada y el archivo vive
   en test/fixtures/, lejos de dataset/raw/.

       node tools/gen_vbt_prueba.mjs
   ============================================================ */

import { GrabadorIMU } from '../app/js/imu.js';
import { writeFileSync, mkdirSync } from 'node:fs';

const SALIDA = '../firmware/test/fixtures';
const HZ = 60, REPS = 3, T_REP = 2.0;

const g = new GrabadorIMU();
g.grabando = true;

const n = Math.round(HZ * (1 + REPS * T_REP + 1));   // 1 s quieto de cada lado
for (let i = 0; i < n; i++) {
  const t = i / HZ;
  const dentro = t > 1 && t < 1 + REPS * T_REP;
  const f = dentro ? Math.sin(((t - 1) / T_REP) * 2 * Math.PI) : 0;
  g._onMotion({
    accelerationIncludingGravity: { x: 0.2 * f, y: 0.1 * f, z: 9.80665 + 3.5 * f },
    rotationRate: { alpha: 3 * f, beta: 2 * f, gamma: 1 * f },
  });
}

g.grabando = false;
/* En Node no transcurre tiempo real entre muestras, asi que la ventana se
   fija a mano para que el ODR del header salga 60 y no un numero absurdo. */
g.t0 = 0;
g.tUltima = (n / HZ) * 1000;

mkdirSync(SALIDA, { recursive: true });
const opts = { exerciseId: 1, loadKg: 82.5, repsReales: REPS,
               nota: 'senal sintetica, solo para verificar el formato' };
writeFileSync(`${SALIDA}/prueba_formato.vbt`, Buffer.from(await g.aVbt(opts).arrayBuffer()));
writeFileSync(`${SALIDA}/prueba_formato.json`, Buffer.from(await g.aJson(opts).arrayBuffer()));

console.log(`${g.cantidad} muestras a ${Math.round(g.odr)} Hz -> ${SALIDA}/prueba_formato.vbt`);
