/* ============================================================
   params.js — GENERADO. No editar a mano.

   Espejo de VBT_PARAM_SPECS en firmware/src/ble/protocol.h. Se regenera con:

       node tools/gen_config_js.mjs

   El firmware es la fuente de verdad y el unico control real: valida cada
   escritura contra estos mismos rangos. Lo de aca sirve para que la interfaz
   no ofrezca valores que el sensor va a rechazar.

   Los textos para humanos estan en config.js, no aca.
   ============================================================ */

export const PARAMS = [
  {
    nombre: "TAP_THS",
    id: 16,
    tipo: 0,
    min: 1,
    max: 31,
    def: 12,
    escribible: true
  },
  {
    nombre: "TAP_SHOCK",
    id: 17,
    tipo: 0,
    min: 0,
    max: 3,
    def: 3,
    escribible: true
  },
  {
    nombre: "TAP_QUIET",
    id: 18,
    tipo: 0,
    min: 0,
    max: 3,
    def: 3,
    escribible: true
  },
  {
    nombre: "TAP_DUR",
    id: 19,
    tipo: 0,
    min: 0,
    max: 15,
    def: 7,
    escribible: true
  },
  {
    nombre: "WAKE_THS_MG",
    id: 32,
    tipo: 1,
    min: 125,
    max: 7875,
    def: 2000,
    escribible: true
  },
  {
    nombre: "WAKE_DUR_MS",
    id: 33,
    tipo: 1,
    min: 0,
    max: 5000,
    def: 2000,
    escribible: true
  },
  {
    nombre: "ODR_HZ",
    id: 48,
    tipo: 1,
    min: 208,
    max: 208,
    def: 208,
    escribible: false
  },
  {
    nombre: "ACCEL_FS_G",
    id: 49,
    tipo: 0,
    min: 8,
    max: 8,
    def: 8,
    escribible: false
  },
  {
    nombre: "GYRO_FS_DPS",
    id: 50,
    tipo: 1,
    min: 1000,
    max: 1000,
    def: 1000,
    escribible: false
  },
  {
    nombre: "ODR_CALIB_PPM",
    id: 51,
    tipo: 2,
    min: 0,
    max: 0,
    def: 0,
    escribible: false
  },
  {
    nombre: "REP_MIN_ROM_MM",
    id: 64,
    tipo: 1,
    min: 30,
    max: 600,
    def: 150,
    escribible: true
  },
  {
    nombre: "REP_MAX_ROM_MM",
    id: 65,
    tipo: 1,
    min: 200,
    max: 2000,
    def: 800,
    escribible: true
  },
  {
    nombre: "REP_MIN_DUR_MS",
    id: 66,
    tipo: 1,
    min: 80,
    max: 2000,
    def: 200,
    escribible: true
  },
  {
    nombre: "REP_MAX_DUR_MS",
    id: 67,
    tipo: 1,
    min: 1000,
    max: 20000,
    def: 6000,
    escribible: true
  },
  {
    nombre: "ZUPT_ACC_TOL_MG",
    id: 68,
    tipo: 1,
    min: 10,
    max: 500,
    def: 20,
    escribible: true
  },
  {
    nombre: "ZUPT_GYR_TOL_MDPS",
    id: 69,
    tipo: 1,
    min: 500,
    max: 30000,
    def: 3000,
    escribible: true
  },
  {
    nombre: "SLEEP_TIMEOUT_S",
    id: 80,
    tipo: 1,
    min: 30,
    max: 3600,
    def: 300,
    escribible: true
  },
  {
    nombre: "TRAVEL_TIMEOUT_M",
    id: 81,
    tipo: 1,
    min: 60,
    max: 43200,
    def: 10080,
    escribible: true
  },
  {
    nombre: "LED_BRIGHTNESS",
    id: 82,
    tipo: 0,
    min: 1,
    max: 100,
    def: 40,
    escribible: true
  },
  {
    nombre: "ADV_WINDOW_MIN",
    id: 83,
    tipo: 1,
    min: 5,
    max: 10080,
    def: 1440,
    escribible: true
  },
  {
    nombre: "SET_END_TIMEOUT_S",
    id: 84,
    tipo: 1,
    min: 5,
    max: 120,
    def: 15,
    escribible: true
  },
  {
    nombre: "CALIB_MIN_MS",
    id: 85,
    tipo: 1,
    min: 300,
    max: 5000,
    def: 1200,
    escribible: true
  }
];

export const PARAM_POR_ID = new Map(PARAMS.map((p) => [p.id, p]));
export const PARAM_POR_NOMBRE = new Map(PARAMS.map((p) => [p.nombre, p]));
