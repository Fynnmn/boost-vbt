// Detector de repeticiones y calculo de velocidad.
//
// Come muestras del IMU de a una y avisa cuando termino una repeticion.
//
// La idea central, y lo que separa esto de un integrador roto:
// NUNCA se integra de forma continua. La velocidad se resetea a cero en cada
// instante de reposo (ZUPT), el bias del acelerometro se re-estima ahi mismo,
// y la integracion ocurre solo dentro de la rep, entre dos anclas. Asi el
// drift no tiene tiempo de acumularse.
//
// Con un bias tipico de 25 mg, integrar tres segundos seguidos inventa mas de
// 2 m/s de velocidad. Ese es el orden del problema que resuelve el ZUPT.

#pragma once

#include <stdint.h>

#include "algo/config.h"
#include "algo/filters.h"
#include "algo/types.h"

namespace vbt {
namespace algo {

class RepDetector {
 public:
  void configure(const Config &cfg);

  // Arranca una serie nueva. Limpia el historial de ROM que usa la deteccion
  // de outliers, pero no la estimacion de bias, que sigue siendo valida.
  void startSet();

  // Procesa una muestra. Devuelve true si en esta muestra se cerro una rep,
  // en cuyo caso queda disponible en lastRep().
  bool update(const Sample &s, uint32_t t_ms);

  const RepMetrics &lastRep() const { return last_rep_; }
  uint8_t repCount() const { return rep_count_; }
  RepPhase phase() const { return phase_; }

  // Expuestos para depurar y graficar. Ver la velocidad estimada junto a la
  // fase explica casi cualquier deteccion rara.
  float velocity() const { return vel_; }
  float verticalAccel() const { return a_lin_; }
  bool isStill() const { return still_.isStill(); }
  float accelBias() const { return bias_; }

 private:
  void enterPhase(RepPhase p, uint32_t t_ms);
  void onStill();
  // Devuelve true si la rep paso la validacion y quedo contada.
  bool finishConcentric(uint32_t t_ms);
  bool validate(RepMetrics &m) const;
  void pushRom(float rom);
  float medianRom() const;

  Config cfg_{};
  GravityEstimator gravity_;
  StillnessDetector still_;

  RepPhase phase_ = RepPhase::kIdle;
  uint32_t phase_start_ms_ = 0;
  uint32_t ecc_start_ms_ = 0;
  uint32_t bottom_start_ms_ = 0;
  uint32_t conc_start_ms_ = 0;
  uint16_t ecc_dur_ms_ = 0;
  uint16_t pause_ms_ = 0;

  float dt_ = 1.0f / 208.0f;
  float vel_ = 0.0f;    // m/s, integrada desde el ultimo ancla
  float a_lin_ = 0.0f;  // m/s^2 propios sobre el eje vertical
  float bias_ = 0.0f;   // m/s^2, offset estimado en reposo
  uint32_t bias_n_ = 0; // muestras de reposo usadas para estimarlo

  // Muestras de la concentrica, guardadas para el post-proceso.
  // Se integra dos veces: una en vivo para la maquina de estados, y otra al
  // cerrar la rep con correccion de drift, que es la que da los numeros
  // finales. Integrar hacia atras permite usar informacion que en vivo
  // todavia no existia.
  float rep_accel_[Config::kMaxRepSamples];
  uint16_t rep_n_ = 0;
  // Indice del buffer donde arranco la concentrica. La correccion de drift
  // se aplica desde un poco antes de aca, NO desde el inicio del buffer:
  // el buffer empieza en la pausa, y repartir el drift sobre la pausa le
  // inventa velocidad positiva que el recorte despues se traga.
  uint16_t conc_idx_ = 0;
  bool rep_overflow_ = false;
  bool rep_saturated_ = false;
  float rot_sum_ = 0.0f;
  uint16_t rot_n_ = 0;
  bool weak_zupt_ = false;
  uint32_t samples_since_anchor_ = 0;

  RepMetrics last_rep_{};
  uint8_t rep_count_ = 0;

  // Historial de ROM de la serie para detectar outliers.
  static constexpr uint8_t kRomHistory = 16;
  float rom_hist_[kRomHistory] = {0};
  uint8_t rom_n_ = 0;
};

}  // namespace algo
}  // namespace vbt
