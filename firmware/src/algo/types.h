// Tipos del algoritmo.
//
// REGLA: nada en src/algo/ incluye Arduino, BLE ni drivers. Recibe numeros y
// devuelve structs. Eso es lo que permite compilar el mismo codigo en la PC y
// en el nRF52840, iterar en segundos contra el dataset, y portarlo algun dia
// sin reescribir la parte que importa.

#pragma once

#include <stdint.h>

namespace vbt {
namespace algo {

constexpr float kGravity = 9.80665f;

// Una muestra ya convertida a unidades fisicas. La conversion desde las
// cuentas crudas del IMU la hace quien llama, con las escalas del header del
// dataset o de la config del driver.
struct Sample {
  float ax, ay, az;  // g
  float gx, gy, gz;  // dps
};

// Resultado de una repeticion detectada. Es lo que despues se empaqueta en
// vbt_rep_result_t para mandar por BLE.
struct RepMetrics {
  uint32_t conc_start_ms = 0;
  uint32_t conc_end_ms = 0;
  float mean_conc_vel = 0.0f;  // m/s
  float mean_prop_vel = 0.0f;  // m/s
  float peak_vel = 0.0f;       // m/s
  float rom = 0.0f;            // m
  uint16_t conc_dur_ms = 0;
  uint16_t ecc_dur_ms = 0;
  uint16_t pause_ms = 0;
  uint8_t peak_vel_pos = 0;  // % del ROM donde ocurrio el pico
  uint8_t quality_flags = 0;
};

// Mismos bits que VBT_QF_* en ble/protocol.h. Duplicados a proposito: algo/
// no puede incluir el header de BLE sin romper su independencia. El test
// verifica que no se desincronicen.
constexpr uint8_t kQfSaturated = 1u << 0;
constexpr uint8_t kQfWeakZupt = 1u << 1;
constexpr uint8_t kQfRomOutlier = 1u << 2;
constexpr uint8_t kQfHighRotation = 1u << 3;
constexpr uint8_t kQfLowConfidence = 1u << 4;

// Estados de la maquina. Se exponen para poder graficarlos al depurar: ver
// en que estado estaba el detector cuando se le escapo una rep vale mas que
// mirar la senal cruda.
enum class RepPhase : uint8_t {
  kIdle = 0,      // en reposo, esperando
  kEccentric,     // bajando
  kBottom,        // pausa abajo -- el mejor ancla de ZUPT que hay
  kConcentric,    // subiendo, esto es lo que se mide
  kLockout,       // arriba, cerrando la rep
};

}  // namespace algo
}  // namespace vbt
