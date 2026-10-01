#pragma once

#include <stdint.h>

namespace vbt {
namespace algo {

// Pasabajos de un polo. Barato en ciclos y en RAM, que es lo que corresponde
// para algo que corre 208 veces por segundo en un Cortex-M4.
class LowPass {
 public:
  void configure(float cutoff_hz, float sample_rate_hz);
  void reset(float value = 0.0f);
  float update(float x);
  float value() const { return y_; }
  void setAlpha(float a) { alpha_ = a; }
  bool initialized() const { return initialized_; }

 private:
  float alpha_ = 0.01f;
  float y_ = 0.0f;
  bool initialized_ = false;
};

// Vector de 3 componentes con lo minimo indispensable.
struct Vec3 {
  float x = 0.0f, y = 0.0f, z = 0.0f;

  float norm() const;
  Vec3 normalized() const;
  float dot(const Vec3 &o) const { return x * o.x + y * o.y + z * o.z; }
};

// Estima el vector gravedad filtrando cada eje por separado. Alcanza porque
// la orientacion de una barra cambia lento comparado con la rep.
class GravityEstimator {
 public:
  // Dos velocidades de seguimiento, y la diferencia entre ellas es lo que
  // hace que esto funcione:
  //
  //   still  -- el sensor esta quieto, TODO lo que mide es gravedad, asi que
  //             conviene seguirla rapido.
  //   motion -- se esta moviendo; seguir rapido seria comerse la aceleracion
  //             de la rep y volverla invisible. Se sigue apenas, lo justo
  //             para no quedar desactualizado si la barra cambia de angulo.
  //
  // Con un solo cutoff no hay numero que sirva: el que salva a un grinder de
  // 2,5 s arruina las reps explosivas, y al reves.
  void configure(float cutoff_still_hz, float cutoff_motion_hz,
                 float sample_rate_hz);
  void reset();

  // Devuelve el vector gravedad estimado, en g.
  Vec3 update(float ax, float ay, float az, bool still);

  Vec3 gravity() const { return {lx_.value(), ly_.value(), lz_.value()}; }

  // Eje vertical: la direccion de la gravedad, normalizada.
  Vec3 up() const { return gravity().normalized(); }

 private:
  LowPass lx_, ly_, lz_;        // seguimiento rapido, en reposo
  float alpha_still_ = 0.01f;
  float alpha_motion_ = 0.001f;
};

// Detecta instantes cuasi-estaticos. Es la pieza sobre la que se apoya todo
// el calculo de velocidad: sin anclas de reposo, integrar un acelerometro es
// inventar numeros.
class StillnessDetector {
 public:
  void configure(float acc_tol_g, float gyr_tol_dps, uint16_t min_ms,
                 float sample_rate_hz);
  void reset();

  // accel_dev: |modulo de la aceleracion - 1 g|, en g. gyro_norm en dps.
  //
  // Se probo usar la gravedad estimada como referencia en vez de 1,0 fijo,
  // para absorber el bias del acelerometro. Empeoro: el filtro de gravedad
  // sigue en parte el movimiento de la rep, asi que la referencia se corre
  // justo cuando no debe. La tolerancia tiene que cubrir el bias.
  bool update(float accel_dev, float gyro_norm);

  bool isStill() const { return still_; }

  // Cuantas muestras seguidas lleva quieto. Sirve para saber si el ancla es
  // solida o apenas se rozo el umbral.
  uint16_t stillSamples() const { return count_; }

 private:
  float acc_tol_ = 0.06f;
  float gyr_tol_ = 3.0f;
  uint16_t min_samples_ = 25;
  uint16_t count_ = 0;
  bool still_ = false;
};

}  // namespace algo
}  // namespace vbt
