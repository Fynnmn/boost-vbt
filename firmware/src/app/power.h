// Politica de energia.
//
// Dado el estado del sensor, dice que tiene que estar prendido y que apagado,
// y cuanto se estima que consume. La capa de plataforma lee el plan y lo
// aplica; este modulo no toca ningun periferico.
//
// Tenerlo como codigo y no como comentarios sueltos permite algo que de otra
// forma no se puede hacer sin la placa: **testear el presupuesto de energia**.
// El test verifica que ningun estado de reposo deje encendido algo caro, que
// es un bug invisible hasta que a alguien se le muere el sensor en una semana.
//
// TODAS las corrientes son estimaciones de datasheet. Hay que reemplazarlas
// por medidas reales despues del test de descarga (ver DECISIONS.md).

#pragma once

#include <stdint.h>

#include "app/state_machine.h"

namespace vbt {
namespace app {

// Corrientes estimadas, en microamperes.
namespace current {

// --- MCU ---
// System ON idle mantiene la RAM y el estado; System OFF consume menos pero
// resetea, y perder el estado obligaria a reconstruirlo en cada despertar.
constexpr uint32_t kMcuSystemOnIdle = 2;
constexpr uint32_t kMcuActive = 3500;

// --- IMU LSM6DS3TR ---
constexpr uint32_t kImuOff = 3;
constexpr uint32_t kImuWakeOnMotion = 25;  // 26 Hz low-power
// El detector de tap por hardware necesita ODR >= 416 Hz. Doce veces mas caro
// que el wake-on-motion: por eso se arma en rafagas de segundos y NUNCA queda
// armado de forma permanente.
constexpr uint32_t kImuTapArmed = 300;
constexpr uint32_t kImuFull = 900;  // 208 Hz, accel + giro

// --- Radio BLE ---
constexpr uint32_t kRadioOff = 0;
// Anunciar cada 1 s con un paquete corto. Es lo que permite que el usuario
// nunca toque el sensor (DECISIONS.md D1).
constexpr uint32_t kRadioAdvertising1s = 25;
constexpr uint32_t kRadioConnected = 350;

// --- Flash QSPI ---
// El deep power-down es obligatorio: sin el, el chip se come ~450 uA en
// reposo. Es la diferencia entre un ano de autonomia y tres semanas.
constexpr uint32_t kFlashDeepPowerDown = 1;
constexpr uint32_t kFlashIdle = 450;
constexpr uint32_t kFlashWriting = 15000;

}  // namespace current

struct PowerPlan {
  bool radio_advertising = false;
  bool radio_connected = false;
  bool flash_deep_power_down = true;
  bool mcu_can_sleep = true;   // puede quedarse en System ON idle entre eventos
  ImuMode imu = ImuMode::kWakeOnMotion;

  // Corriente promedio estimada, en uA.
  uint32_t estimateMicroamps() const;
};

PowerPlan planFor(State state, bool logging_to_flash = false);

// Autonomia en horas con una bateria de la capacidad dada, en mAh.
uint32_t hoursOn(uint32_t microamps, uint32_t battery_mah);

// Autonomia mezclando uso real y reposo, que es lo que le pasa a una persona
// de verdad: entrena un rato por dia y el resto el sensor espera.
uint32_t realisticDays(uint32_t battery_mah, uint32_t minutes_per_day);

}  // namespace app
}  // namespace vbt
