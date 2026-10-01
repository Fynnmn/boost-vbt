#include "app/power.h"

namespace vbt {
namespace app {

uint32_t PowerPlan::estimateMicroamps() const {
  uint32_t total = mcu_can_sleep ? current::kMcuSystemOnIdle
                                 : current::kMcuActive;

  switch (imu) {
    case ImuMode::kOff:          total += current::kImuOff; break;
    case ImuMode::kWakeOnMotion: total += current::kImuWakeOnMotion; break;
    case ImuMode::kTapArmed:     total += current::kImuTapArmed; break;
    case ImuMode::kFull:         total += current::kImuFull; break;
  }

  if (radio_connected) {
    total += current::kRadioConnected;
  } else if (radio_advertising) {
    total += current::kRadioAdvertising1s;
  } else {
    total += current::kRadioOff;
  }

  total += flash_deep_power_down ? current::kFlashDeepPowerDown
                                 : current::kFlashIdle;
  return total;
}

PowerPlan planFor(State state, bool logging_to_flash) {
  PowerPlan p;

  switch (state) {
    case State::kSleep:
    case State::kTravel:
      // El estado en el que el sensor pasa la mayor parte de su vida. Todo
      // apagado menos la vigilancia de movimiento del IMU.
      p.imu = ImuMode::kWakeOnMotion;
      p.radio_advertising = false;
      p.radio_connected = false;
      p.flash_deep_power_down = true;
      p.mcu_can_sleep = true;
      break;

    case State::kAdvertising:
      // Anunciando. El IMU sigue en bajo consumo: no hace falta medir nada
      // hasta que alguien se conecte y arranque una serie.
      p.imu = ImuMode::kWakeOnMotion;
      p.radio_advertising = true;
      p.flash_deep_power_down = true;
      p.mcu_can_sleep = true;
      break;

    case State::kConnectedIdle:
      p.imu = ImuMode::kWakeOnMotion;
      p.radio_connected = true;
      p.flash_deep_power_down = true;
      p.mcu_can_sleep = true;
      break;

    case State::kCalibrating:
    case State::kRecording:
      // Midiendo. Aca no se ahorra: es el momento en que el sensor tiene que
      // hacer bien su trabajo, y son minutos por dia.
      p.imu = ImuMode::kFull;
      p.radio_connected = true;
      p.flash_deep_power_down = !logging_to_flash;
      p.mcu_can_sleep = false;
      break;

    case State::kLogger:
      p.imu = ImuMode::kFull;
      p.radio_connected = true;
      p.flash_deep_power_down = false;  // grabando, tiene que estar despierta
      p.mcu_can_sleep = false;
      break;

    case State::kError:
      // Algo falla. Apagar todo menos la radio, para poder avisar por BLE
      // que paso en vez de quedarse mudo.
      p.imu = ImuMode::kOff;
      p.radio_advertising = true;
      p.flash_deep_power_down = true;
      p.mcu_can_sleep = true;
      break;
  }

  return p;
}

uint32_t hoursOn(uint32_t microamps, uint32_t battery_mah) {
  if (microamps == 0) return 0xFFFFFFFF;
  return (battery_mah * 1000u) / microamps;
}

uint32_t realisticDays(uint32_t battery_mah, uint32_t minutes_per_day) {
  // Un dia tipico: unos minutos entrenando y el resto anunciando, porque el
  // usuario entrena seguido y el sensor nunca llega a dormirse del todo.
  // Es el caso PEOR de los realistas, y por eso el que conviene calcular.
  const uint32_t uA_entrenando = planFor(State::kRecording).estimateMicroamps();
  const uint32_t uA_esperando = planFor(State::kAdvertising).estimateMicroamps();

  const uint32_t min_esperando = 1440 - minutes_per_day;
  // uA * minutos, en microamperes-minuto por dia.
  const uint32_t uAmin_por_dia =
      uA_entrenando * minutes_per_day + uA_esperando * min_esperando;

  const uint32_t uAmin_bateria = battery_mah * 1000u * 60u;
  if (uAmin_por_dia == 0) return 0xFFFFFFFF;
  return uAmin_bateria / uAmin_por_dia;
}

}  // namespace app
}  // namespace vbt
