/* ============================================================
   check_params.mjs — verifica que app/js/params.js siga al firmware.

   La tabla de parametros vive en firmware/src/ble/protocol.h. La app la
   espeja para no ofrecer rangos que el sensor va a rechazar. Si los dos se
   separan, el sintoma es feo y tardio: un slider que llega hasta 500 y un
   sensor que corta en 300, o al reves.

   Esto NO escribe nada: compara y falla. Para regenerar:

       node tools/gen_config_js.mjs
   ============================================================ */

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const ACTUAL = '../app/js/params.js';

const antes = readFileSync(ACTUAL, 'utf8');
execFileSync(process.execPath, ['gen_config_js.mjs'], { stdio: 'pipe' });
const despues = readFileSync(ACTUAL, 'utf8');

if (antes === despues) {
  console.log('OK: params.js coincide con protocol.h');
  process.exit(0);
}

/* Se deja el archivo regenerado, que es el correcto, pero se falla igual:
   quien corra esto tiene que enterarse de que estaba desactualizado. */
console.error('FALLA: params.js estaba desactualizado respecto de protocol.h.');
console.error('Se regeneró. Revisá el cambio y volvé a correr los tests.');
process.exit(1);
