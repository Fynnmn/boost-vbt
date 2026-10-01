// protocol.h — contrato BLE del sensor VBT.
//
// Espejo exacto de docs/PROTOCOL.md. Si tocas algo aca, actualiza tambien
// ese documento y tools/decode.py, y subi VBT_SCHEMA_VERSION.
//
// Sin dependencias de Arduino ni de BLE a proposito: este header lo incluye
// tanto el firmware como el harness que corre en la PC.

#pragma once

#include <stdint.h>

#define VBT_SCHEMA_VERSION 1
#define VBT_FW_VERSION_MAJOR 0
#define VBT_FW_VERSION_MINOR 1

// ---------------------------------------------------------------------------
// UUIDs
// ---------------------------------------------------------------------------
// Base del servicio propio: 7d4e1aXX-9b3f-4c62-a5d8-6e1f2c3b4a59
// Los servicios 0x180F (Battery) y 0x180A (Device Information) son SIG.

#define VBT_UUID_SERVICE     "7d4e1a00-9b3f-4c62-a5d8-6e1f2c3b4a59"
#define VBT_UUID_REP_RESULT  "7d4e1a01-9b3f-4c62-a5d8-6e1f2c3b4a59"
#define VBT_UUID_SET_SUMMARY "7d4e1a02-9b3f-4c62-a5d8-6e1f2c3b4a59"
#define VBT_UUID_CONTROL     "7d4e1a03-9b3f-4c62-a5d8-6e1f2c3b4a59"
#define VBT_UUID_CONFIG      "7d4e1a04-9b3f-4c62-a5d8-6e1f2c3b4a59"
#define VBT_UUID_STATUS      "7d4e1a05-9b3f-4c62-a5d8-6e1f2c3b4a59"
#define VBT_UUID_RAW_STREAM  "7d4e1a06-9b3f-4c62-a5d8-6e1f2c3b4a59"
#define VBT_UUID_LOG_DUMP    "7d4e1a07-9b3f-4c62-a5d8-6e1f2c3b4a59"

// Los mismos UUIDs en bytes little-endian, que es como los quiere el stack
// BLE de Adafruit. Ojo: el orden esta invertido respecto del string de arriba.
#define VBT_UUID128_BASE(x)                                                    \
  { 0x59, 0x4a, 0x3b, 0x2c, 0x1f, 0x6e, 0xd8, 0xa5,                            \
    0x62, 0x4c, 0x3f, 0x9b, (x), 0x1a, 0x4e, 0x7d }

// ---------------------------------------------------------------------------
// Escalas del IMU (para convertir en la PC, no en el micro)
// ---------------------------------------------------------------------------
#define VBT_ACCEL_LSB_MG    0.244f   // fondo de escala +-8 g
#define VBT_GYRO_LSB_MDPS   35.0f    // fondo de escala +-1000 dps
#define VBT_SAMPLE_SATURATED 32767   // valor que indica saturacion

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

typedef enum {
  VBT_STATE_SLEEP          = 0,
  VBT_STATE_ADVERTISING    = 1,
  VBT_STATE_CONNECTED_IDLE = 2,
  VBT_STATE_RECORDING      = 3,
  VBT_STATE_LOGGER         = 4,
  VBT_STATE_TRAVEL         = 5,
  VBT_STATE_ERROR          = 6,
  // Agregado despues de congelar el esquema. NO sube SCHEMA_VERSION: sumar un
  // valor a un enum no cambia el tamano ni el orden de ningun campo, asi que
  // una app vieja simplemente ve un estado que no conoce.
  VBT_STATE_CALIBRATING    = 7,
} vbt_state_t;

typedef enum {
  VBT_EX_UNKNOWN   = 0,
  VBT_EX_BENCH     = 1,
  VBT_EX_SQUAT     = 2,
  VBT_EX_DEADLIFT  = 3,
  VBT_EX_OHP       = 4,
  VBT_EX_ROW       = 5,
  VBT_EX_HIPTHRUST = 6,
} vbt_exercise_t;

typedef enum {
  VBT_OP_SET_START      = 0x01,  // u8 exercise_id, u16 load_kg_x10
  VBT_OP_SET_STOP       = 0x02,
  VBT_OP_SLEEP          = 0x03,
  VBT_OP_MODE_LOGGER    = 0x04,  // u8 enable
  VBT_OP_MODE_RAWSTREAM = 0x05,  // u8 enable
  VBT_OP_SET_TIME       = 0x06,  // u32 unix_s
  VBT_OP_LOG_ERASE      = 0x07,
  VBT_OP_LOG_DUMP       = 0x08,  // u16 session_id
  VBT_OP_CALIB_ODR      = 0x09,
  VBT_OP_FACTORY_RESET  = 0x0A,
  VBT_OP_LOG_LIST       = 0x0B,  // sin payload: enumera las sesiones grabadas
} vbt_opcode_t;

typedef enum {
  VBT_ERR_NONE          = 0,
  VBT_ERR_IMU_NO_ACK    = 1,
  VBT_ERR_IMU_WHOAMI    = 2,
  VBT_ERR_FIFO_OVERRUN  = 3,
  VBT_ERR_LOG_FULL      = 4,
  VBT_ERR_QSPI          = 5,
  VBT_ERR_BAD_OPCODE    = 6,
  VBT_ERR_BAD_PARAM     = 7,
  VBT_ERR_MTU           = 8,
  VBT_ERR_BATTERY_CRIT  = 9,
} vbt_error_t;

// quality_flags de RepResult. El firmware informa, la app decide:
// una rep marcada igual se notifica, nunca se descarta en el sensor.
#define VBT_QF_SATURATED      (1u << 0)
#define VBT_QF_WEAK_ZUPT      (1u << 1)
#define VBT_QF_ROM_OUTLIER    (1u << 2)
#define VBT_QF_HIGH_ROTATION  (1u << 3)
#define VBT_QF_LOW_CONFIDENCE (1u << 4)

// flags de Status
#define VBT_SF_IMU_OK            (1u << 0)
#define VBT_SF_CHARGING          (1u << 1)
#define VBT_SF_LOG_FULL          (1u << 2)
#define VBT_SF_SATURATED_RECENT  (1u << 3)
#define VBT_SF_CONFIG_DIRTY      (1u << 4)
// Si viene en cero, la serie arranco sin que el sensor llegara a medir su
// propio offset: las velocidades tienen mas error y las reps salen marcadas
// con WEAK_ZUPT. La app las muestra con advertencia, no las oculta.
#define VBT_SF_CALIBRATED        (1u << 5)

// param_id de Config. Clave-valor a proposito: agregar un parametro nuevo
// no cambia el SCHEMA_VERSION ni rompe la app.
typedef enum {
  VBT_P_TAP_THS           = 0x10,
  VBT_P_TAP_SHOCK         = 0x11,
  VBT_P_TAP_QUIET         = 0x12,
  VBT_P_TAP_DUR           = 0x13,
  VBT_P_WAKE_THS_MG       = 0x20,
  VBT_P_WAKE_DUR_MS       = 0x21,
  VBT_P_ODR_HZ            = 0x30,
  VBT_P_ACCEL_FS_G        = 0x31,
  VBT_P_GYRO_FS_DPS       = 0x32,
  VBT_P_ODR_CALIB_PPM     = 0x33,
  VBT_P_REP_MIN_ROM_MM    = 0x40,
  VBT_P_REP_MAX_ROM_MM    = 0x41,
  VBT_P_REP_MIN_DUR_MS    = 0x42,
  VBT_P_REP_MAX_DUR_MS    = 0x43,
  VBT_P_ZUPT_ACC_TOL_MG   = 0x44,
  VBT_P_ZUPT_GYR_TOL_MDPS = 0x45,
  VBT_P_SLEEP_TIMEOUT_S   = 0x50,
  VBT_P_TRAVEL_TIMEOUT_M  = 0x51,
  VBT_P_LED_BRIGHTNESS    = 0x52,
  VBT_P_ADV_WINDOW_MIN    = 0x53,
  VBT_P_SET_END_TIMEOUT_S = 0x54,
  VBT_P_CALIB_MIN_MS      = 0x55,
} vbt_param_t;


#define VBT_PARAM_TYPE_U8    0
#define VBT_PARAM_TYPE_U16   1
#define VBT_PARAM_TYPE_I16   2
#define VBT_PARAM_TYPE_U32   3
#define VBT_PARAM_TYPE_F32   4
#define VBT_PARAM_TYPE_READ  0xFF  // escribir con este tipo = pedir lectura

// ---------------------------------------------------------------------------
// Rangos validos de cada parametro
// ---------------------------------------------------------------------------
// El sensor es el UNICO control real: cualquiera con un celular puede escribir
// bytes arbitrarios en la caracteristica de Config. Un slider en la app limita
// lo que manda la app, no lo que llega al sensor.
//
// No es una preocupacion teorica: ZUPT_ACC_TOL_MG = 65535 son 65 g de
// tolerancia, con lo cual todo parece quieto y el sensor deja de contar
// repeticiones para siempre, sin ningun sintoma que apunte a la causa.
//
// La tabla es la unica fuente de verdad. La app la espeja en js/config.js y
// docs/PROTOCOL.md la documenta; si cambian los tres tienen que moverse
// juntos.
typedef struct {
  uint8_t param_id;
  uint8_t param_type;
  uint32_t min;
  uint32_t max;
  uint32_t def;      // el valor de fabrica, para poder volver atras
  uint8_t writable;  // 0 = solo lectura (ver nota abajo)
} vbt_param_spec_t;

// ODR_HZ, ACCEL_FS_G y GYRO_FS_DPS son de solo lectura a proposito: cambiarlos
// en caliente obliga a reconfigurar el IMU y a tirar el FIFO en el medio de una
// serie, y ademas invalidaria las escalas que ya quedaron escritas en el header
// de las grabaciones. Se leen para que la app sepa contra que esta midiendo.
static const vbt_param_spec_t VBT_PARAM_SPECS[] = {
  // id,                      tipo,                min,   max,   default, esc
  {VBT_P_TAP_THS,           VBT_PARAM_TYPE_U8,       1,    31,        12, 1},
  {VBT_P_TAP_SHOCK,         VBT_PARAM_TYPE_U8,       0,     3,         3, 1},
  {VBT_P_TAP_QUIET,         VBT_PARAM_TYPE_U8,       0,     3,         3, 1},
  {VBT_P_TAP_DUR,           VBT_PARAM_TYPE_U8,       0,    15,         7, 1},
  {VBT_P_WAKE_THS_MG,       VBT_PARAM_TYPE_U16,    125,  7875,      2000, 1},
  {VBT_P_WAKE_DUR_MS,       VBT_PARAM_TYPE_U16,      0,  5000,      2000, 1},
  {VBT_P_ODR_HZ,            VBT_PARAM_TYPE_U16,    208,   208,       208, 0},
  {VBT_P_ACCEL_FS_G,        VBT_PARAM_TYPE_U8,       8,     8,         8, 0},
  {VBT_P_GYRO_FS_DPS,       VBT_PARAM_TYPE_U16,   1000,  1000,      1000, 0},
  {VBT_P_ODR_CALIB_PPM,     VBT_PARAM_TYPE_I16,      0,     0,         0, 0},
  {VBT_P_REP_MIN_ROM_MM,    VBT_PARAM_TYPE_U16,     30,   600,       150, 1},
  {VBT_P_REP_MAX_ROM_MM,    VBT_PARAM_TYPE_U16,    200,  2000,       800, 1},
  {VBT_P_REP_MIN_DUR_MS,    VBT_PARAM_TYPE_U16,     80,  2000,       200, 1},
  {VBT_P_REP_MAX_DUR_MS,    VBT_PARAM_TYPE_U16,   1000, 20000,      6000, 1},
  {VBT_P_ZUPT_ACC_TOL_MG,   VBT_PARAM_TYPE_U16,     10,   500,        20, 1},
  {VBT_P_ZUPT_GYR_TOL_MDPS, VBT_PARAM_TYPE_U16,    500, 30000,      3000, 1},
  {VBT_P_SLEEP_TIMEOUT_S,   VBT_PARAM_TYPE_U16,     30,  3600,       300, 1},
  {VBT_P_TRAVEL_TIMEOUT_M,  VBT_PARAM_TYPE_U16,     60, 43200,     10080, 1},
  {VBT_P_LED_BRIGHTNESS,    VBT_PARAM_TYPE_U8,       1,   100,        40, 1},
  {VBT_P_ADV_WINDOW_MIN,    VBT_PARAM_TYPE_U16,      5, 10080,      1440, 1},
  {VBT_P_SET_END_TIMEOUT_S, VBT_PARAM_TYPE_U16,      5,   120,        15, 1},
  {VBT_P_CALIB_MIN_MS,      VBT_PARAM_TYPE_U16,    300,  5000,      1200, 1},
};

#define VBT_PARAM_COUNT   (sizeof(VBT_PARAM_SPECS) / sizeof(VBT_PARAM_SPECS[0]))

// Devuelve NULL si el param_id no existe.
static inline const vbt_param_spec_t *vbt_param_spec(uint8_t param_id) {
  for (unsigned i = 0; i < VBT_PARAM_COUNT; ++i) {
    if (VBT_PARAM_SPECS[i].param_id == param_id) return &VBT_PARAM_SPECS[i];
  }
  return 0;
}


// ---------------------------------------------------------------------------
// Payloads
// ---------------------------------------------------------------------------
// Todo little-endian y packed. Los tres primeros entran en 20 bytes, que es
// el maximo garantizado con el MTU por defecto: funcionan aunque la
// negociacion de MTU falle.

#pragma pack(push, 1)

typedef struct {
  uint8_t  schema;         // VBT_SCHEMA_VERSION
  uint8_t  rep_index;      // 1-based dentro de la serie
  uint16_t mean_conc_vel;  // mm/s -- la metrica principal de VBT
  uint16_t mean_prop_vel;  // mm/s
  uint16_t peak_vel;       // mm/s
  uint16_t rom;            // mm
  uint16_t conc_dur_ms;
  uint16_t ecc_dur_ms;
  uint16_t pause_ms;
  uint8_t  quality_flags;
  uint8_t  peak_vel_pos;   // % del ROM donde ocurrio el pico, 0-100
  uint8_t  set_index;
  uint8_t  reserved;
} vbt_rep_result_t;

typedef struct {
  uint8_t  schema;
  uint8_t  set_index;
  uint8_t  rep_count;
  uint8_t  exercise_id;
  uint16_t best_mean_vel;      // mm/s
  uint16_t first_rep_vel;      // mm/s
  uint16_t last_rep_vel;       // mm/s
  uint16_t velocity_loss_x10;  // % x10, contra la MEJOR rep, no la primera
  uint16_t load_kg_x10;
  uint32_t duration_ms;
  uint8_t  flags;              // OR de los quality_flags de toda la serie
  uint8_t  reserved;
} vbt_set_summary_t;

typedef struct {
  uint8_t  schema;
  uint8_t  state;              // vbt_state_t
  uint8_t  battery_pct;
  uint8_t  flags;
  uint16_t battery_mv;
  uint8_t  rep_count;
  uint8_t  exercise_id;
  uint32_t uptime_s;
  uint32_t log_free_bytes;
  uint16_t fw_version;         // mayor << 8 | menor
  uint8_t  last_error;         // vbt_error_t
  uint8_t  reserved;
} vbt_status_t;

typedef struct {
  uint8_t schema;
  uint8_t param_id;            // vbt_param_t
  uint8_t param_type;          // VBT_PARAM_TYPE_*
  uint8_t reserved;
  uint8_t value[4];            // little-endian, segun param_type
} vbt_config_t;

// Una muestra cruda del IMU: 12 bytes, sin convertir.
// Convertir en el micro gastaria ciclos, perderia precision y esconderia
// la saturacion. Las escalas se aplican en la PC.
typedef struct {
  int16_t ax, ay, az;
  int16_t gx, gy, gz;
} vbt_sample_t;

// Encabezado de lote para RawStream y LogDump. Con MTU 247 entran
// 19 muestras por lote, o sea 11 notificaciones por segundo a 208 Hz.
typedef struct {
  uint8_t  schema;
  uint8_t  count;
  uint16_t seq;                // para detectar lotes perdidos
  uint32_t t0_us;              // timestamp de la primera muestra del lote
  // le siguen count * vbt_sample_t
} vbt_batch_header_t;

#pragma pack(pop)

// Valores especiales de `count`. Con MTU 247 entran 19 muestras por lote, asi
// que de 20 para arriba queda libre y se puede senalizar sin agrandar el
// encabezado ni subir el SCHEMA_VERSION.
//
// Sin esto el volcado no tiene forma de decir donde termina, y la app se
// quedaria esperando para siempre un lote que no viene — que es exactamente
// como se ve un sensor colgado.
#define VBT_BATCH_SESSION_HDR 0xFE  // el payload son 32 B de SessionHeader
#define VBT_BATCH_END         0xFF  // fin del volcado; t0_us = total enviado

#define VBT_BATCH_MAX_PAYLOAD 244
#define VBT_BATCH_MAX_SAMPLES                                                  \
  ((VBT_BATCH_MAX_PAYLOAD - (int)sizeof(vbt_batch_header_t)) /                 \
   (int)sizeof(vbt_sample_t))

// El compilador verifica los tamanos. Si alguno de estos falla es porque el
// padding se colo, y el payload dejaria de coincidir con PROTOCOL.md.
#if defined(__cplusplus) && __cplusplus >= 201103L
static_assert(sizeof(vbt_rep_result_t) == 20, "RepResult debe entrar en 20 B");
static_assert(sizeof(vbt_set_summary_t) == 20, "SetSummary debe entrar en 20 B");
static_assert(sizeof(vbt_status_t) == 20, "Status debe entrar en 20 B");
static_assert(sizeof(vbt_config_t) == 8, "Config debe ser de 8 B");
static_assert(sizeof(vbt_sample_t) == 12, "Sample debe ser de 12 B");
static_assert(sizeof(vbt_batch_header_t) == 8, "BatchHeader debe ser de 8 B");
static_assert(VBT_BATCH_MAX_SAMPLES == 19, "19 muestras por lote con MTU 247");
#endif
