// Servicio BLE del sensor.
//
// Traduce entre el mundo interno (RepMetrics, estados, config) y los bytes
// que viajan por el aire, exactamente como los define docs/PROTOCOL.md.
//
// No decide nada: no arranca series ni cambia de estado. Decodifica comandos y
// los devuelve para que main los convierta en eventos de la maquina de
// estados. Mantenerlo tonto es lo que permite testear el protocolo por
// separado de la logica.

#pragma once

#include <stdint.h>

#include "algo/config.h"
#include "algo/types.h"
#include "app/state_machine.h"
#include "ble/ble_stack.h"
#include "ble/protocol.h"

namespace vbt {
namespace ble {

// Comando decodificado del central. main lo traduce a eventos.
struct Command {
  bool valid = false;
  vbt_opcode_t opcode = VBT_OP_SET_STOP;
  uint8_t exercise_id = 0;
  uint16_t load_kg_x10 = 0;
  bool enable = false;
  uint32_t unix_s = 0;
  uint16_t session_id = 0;
  vbt_error_t error = VBT_ERR_NONE;
};

// Estado que el servicio necesita para armar el Status. Se le pasa entero en
// vez de tenerlo adentro: asi el servicio no guarda copias que se
// desincronizan de la fuente real.
struct StatusInfo {
  app::State state = app::State::kSleep;
  uint8_t battery_pct = 0;
  uint16_t battery_mv = 0;
  uint8_t rep_count = 0;
  uint8_t exercise_id = 0;
  uint32_t uptime_s = 0;
  uint32_t log_free_bytes = 0;
  vbt_error_t last_error = VBT_ERR_NONE;
  bool imu_ok = true;
  bool charging = false;
  bool log_full = false;
  bool saturated_recently = false;
  bool config_dirty = false;
  bool calibrated = false;
};

// Los parametros del IMU que se calibran en el gimnasio. Viven aca y no en el
// driver a proposito: el servicio BLE no tiene por que conocer registros del
// LSM6DS3TR-C, y asi se puede probar en la PC sin chip. La capa de aplicacion
// los aplica al driver cuando ve el flag config_dirty.
//
// Los cuatro del doble tap son los que ESTADO.md manda calibrar con la carcasa
// puesta: sin carcasa los valores no significan nada, porque el plastico
// cambia como se transmite el golpe.
struct SensorTuning {
  uint8_t tap_ths = 12;        // TAP_THS[4:0], LSB = FS/32
  uint8_t tap_shock = 3;       // SHOCK[1:0]
  uint8_t tap_quiet = 3;       // QUIET[1:0]
  uint8_t tap_dur = 7;         // DUR[3:0], ventana entre los dos golpes
  uint16_t wake_ths_mg = 2000; // umbral de wake-on-motion
  uint16_t wake_dur_ms = 2000;
  uint16_t sleep_timeout_s = 300;
  uint8_t led_brightness = 40;
  bool dirty = false;          // hay cambios sin aplicar al hardware
};

class VbtService {
 public:
  void begin(IBleStack &stack, algo::Config &algo_cfg, app::Config &app_cfg,
             SensorTuning &tuning);

  // --- Salida hacia el celular -----------------------------------------
  bool notifyRep(const algo::RepMetrics &m, uint8_t rep_index,
                 uint8_t set_index);
  bool notifySetSummary(uint8_t set_index, uint8_t rep_count,
                        uint8_t exercise_id, uint16_t load_kg_x10,
                        uint32_t duration_ms);
  bool notifyStatus(const StatusInfo &info);
  bool notifyBattery(uint8_t percent);

  // Lote de muestras crudas. Recorta al MTU disponible y devuelve cuantas
  // muestras entraron: si la negociacion de MTU fallo, manda menos por lote
  // en vez de no mandar nada.
  uint8_t notifySamples(const int16_t *xyz6, uint8_t n_samples,
                        uint32_t t0_us);

  // --- Volcado del log interno ------------------------------------------
  // Los tres van por LogDump y comparten el mismo encabezado de lote que
  // RawStream, asi que la app usa un solo parser para todo.

  // El header de 32 B de una sesion. Es EXACTAMENTE el header del archivo
  // .vbt: la app copia los bytes y ya tiene un archivo valido.
  bool notifyLogHeader(const uint8_t *header32);

  // Un tramo de muestras crudas. Devuelve cuantas entraron en el MTU real.
  uint8_t notifyLogSamples(const int16_t *xyz6, uint8_t n_samples);

  // Cierra el volcado. `total_muestras` viaja para que la app pueda comparar
  // contra lo que recibio en vez de dar por buena una descarga incompleta.
  bool notifyLogEnd(uint32_t total_muestras);

  // --- Entrada desde el celular ----------------------------------------
  Command onControlWrite(const uint8_t *data, uint16_t len);
  vbt_error_t onConfigWrite(const uint8_t *data, uint16_t len);

  // Acumuladores de la serie en curso, para el resumen.
  void startSet();
  void trackRep(const algo::RepMetrics &m);

  uint16_t seq() const { return seq_; }

 private:
  static uint16_t toMillis(float value);
  bool readParam(uint8_t param_id);
  vbt_error_t writeParam(uint8_t param_id, uint8_t type, const uint8_t *value);

  IBleStack *stack_ = nullptr;
  algo::Config *algo_cfg_ = nullptr;
  app::Config *app_cfg_ = nullptr;
  SensorTuning *tuning_ = nullptr;
  uint16_t seq_ = 0;

  // Acumuladores de la serie.
  float best_vel_ = 0.0f;
  float first_vel_ = 0.0f;
  float last_vel_ = 0.0f;
  uint8_t set_flags_ = 0;
  uint8_t reps_in_set_ = 0;
};

}  // namespace ble
}  // namespace vbt
