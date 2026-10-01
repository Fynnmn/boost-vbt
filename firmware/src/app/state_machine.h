// Maquina de estados del sensor.
//
// Implementa el flujo de uso decidido en docs/DECISIONS.md (D1-D4):
// el usuario nunca toca el sensor. Abre la app, aprieta empezar, entrena, y
// la serie se cierra sola.
//
// Es logica PURA: no toca el IMU, ni la radio, ni el LED. Recibe eventos y
// tiempo, y expone que deberia estar haciendo cada periferico. La capa de
// plataforma lee esos "deseos" y los aplica.
//
// Se escribio asi para poder probar hoy, sin placa, cosas que de otro modo
// solo se verificarian en septiembre: que el sensor no se despierte en el
// bolso, que la serie se cierre sola, que el modo viaje no reaccione al
// movimiento, que una calibracion incompleta quede marcada y no oculta.

#pragma once

#include <stdint.h>

namespace vbt {
namespace app {

// Mismos valores que vbt_state_t en ble/protocol.h. Duplicados a proposito:
// app/ no incluye el header de BLE. El test verifica que no se desincronicen.
enum class State : uint8_t {
  kSleep = 0,
  kAdvertising = 1,
  kConnectedIdle = 2,
  kRecording = 3,
  kLogger = 4,
  kTravel = 5,
  kError = 6,
  kCalibrating = 7,
};

enum class Event : uint8_t {
  kDoubleTap,        // el IMU detecto dos golpes secos
  kMotionValidated,  // movimiento fuerte, horizontal y sostenido
  kConnected,        // el celular se conecto
  kDisconnected,
  kSetStart,         // el usuario apreto empezar en la app
  kSetStop,          // el usuario apreto terminar
  kSleepCommand,     // la app pidio dormir ya
  kLoggerOn,
  kLoggerOff,
  kRepDetected,      // el algoritmo cerro una repeticion
  kImuFailed,
  kBatteryCritical,
};

// Que tiene que estar haciendo el IMU. Es lo que define el consumo.
enum class ImuMode : uint8_t {
  kOff = 0,
  kWakeOnMotion,  // 26 Hz low-power, ~25 uA -- el modo de reposo
  kTapArmed,      // 416 Hz, ~300 uA -- solo en rafagas de segundos
  kFull,          // 208 Hz con FIFO -- midiendo
};

enum class LedPattern : uint8_t {
  kOff = 0,
  kBlueBlink,      // buscando / anunciando
  kBlueFastBlink,  // calibrando
  kBlueSolid,      // conectado
  kGreen,          // grabando serie
  kGreenBlink,     // modo logger
  kRedSlowBlink,   // bateria baja
  kRedFastBlink,   // error
};

struct Config {
  uint32_t adv_window_ms = 24u * 60u * 60u * 1000u;   // 24 h anunciando
  uint32_t travel_timeout_ms = 7u * 24u * 60u * 60u * 1000u;  // 7 dias
  uint32_t set_end_timeout_ms = 15000;  // sin movimiento -> cierra la serie
  uint32_t calib_min_ms = 1200;         // quietud necesaria para calibrar
  uint32_t calib_give_up_ms = 8000;     // si no logra calibrar, arranca igual
  uint32_t tap_window_ms = 3000;        // cuanto queda armado el tap al despertar
  uint8_t low_battery_pct = 15;
};

class StateMachine {
 public:
  void configure(const Config &cfg);
  void reset(uint32_t now_ms);

  // Devuelve true si el estado cambio.
  bool onEvent(Event e, uint32_t now_ms);

  // Llamar seguido. Maneja todos los vencimientos por tiempo.
  bool tick(uint32_t now_ms);

  // Se llama con cada muestra para saber si la barra se esta moviendo. Es lo
  // que alimenta el cierre automatico de la serie.
  void notifyMotion(uint32_t now_ms) { last_motion_ms_ = now_ms; }

  // Quietud sostenida durante la calibracion.
  void notifyStill(bool still, uint32_t now_ms);

  void setBattery(uint8_t pct) { battery_pct_ = pct; }

  State state() const { return state_; }
  ImuMode imuMode() const;
  bool wantsAdvertising() const;
  LedPattern led() const;

  // True si la serie arranco con la calibracion completa. Si es false, las
  // reps salen marcadas: el firmware informa, la app decide (D3, D7).
  bool calibrated() const { return calibrated_; }
  uint8_t repCount() const { return rep_count_; }

  // Motivo por el que se cerro la ultima serie. Sirve para que la app
  // distinga "terminaste vos" de "se cerro sola".
  bool lastSetEndedByTimeout() const { return set_ended_by_timeout_; }

 private:
  bool enter(State s, uint32_t now_ms);

  Config cfg_{};
  State state_ = State::kSleep;
  uint32_t state_since_ms_ = 0;
  uint32_t last_connection_ms_ = 0;
  uint32_t last_motion_ms_ = 0;
  uint32_t still_since_ms_ = 0;
  uint32_t tap_armed_until_ms_ = 0;
  bool still_ = false;
  bool calibrated_ = false;
  bool set_ended_by_timeout_ = false;
  bool logger_requested_ = false;
  uint8_t battery_pct_ = 100;
  uint8_t rep_count_ = 0;
};

}  // namespace app
}  // namespace vbt
