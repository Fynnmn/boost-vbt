// Medicion de bateria.
//
// Logica pura: recibe milivoltios y devuelve porcentaje. La lectura del ADC
// la hace la capa de plataforma.
//
// DOS REGLAS QUE NO SE PUEDEN SALTEAR, y las dos son de la plataforma, no de
// este modulo:
//
// 1. NUNCA medir durante una transmision de radio. El pico de corriente del
//    transmisor hunde la tension de la bateria por su resistencia interna, y
//    el ADC lee 3,7 V cuando en reposo hay 3,9 V. Eso son ~40 puntos de
//    porcentaje de diferencia: el usuario ve "20%" con la bateria casi llena.
//
// 2. Promediar varias lecturas (16 alcanza). El ADC del nRF52840 tiene ruido
//    de varios milivoltios y una sola lectura hace bailar el porcentaje.
//
// El divisor de tension de la XIAO se habilita por un GPIO y se lee por un
// pin analogico. Los numeros de pin y la relacion del divisor salen del
// variant.h del board package, NO del wiki: cambian entre revisiones de
// placa. Verificar el dia 1 y anotar en DECISIONS.md.

#pragma once

#include <stdint.h>

namespace vbt {
namespace app {

class BatteryMonitor {
 public:
  // hysteresis_pct: cuanto tiene que cambiar la estimacion para que el
  // porcentaje reportado se mueva. Sin esto el numero baila entre 71 y 72 y
  // parece que el sensor esta roto.
  void configure(uint8_t hysteresis_pct = 2);
  void reset();

  // Alimentar con el promedio de varias lecturas del ADC, en mV.
  void update(uint16_t millivolts);

  uint8_t percent() const { return reported_pct_; }
  uint16_t millivolts() const { return mv_; }

  // El chip de carga (BQ25101) tiene su propio LED naranja y maneja la carga
  // solo, sin codigo. Esto es solo para reportarlo por BLE.
  bool isCharging() const { return charging_; }
  void setCharging(bool c) { charging_ = c; }

  // Por debajo de esto hay que dormir: seguir midiendo con la bateria en el
  // piso arriesga cortar una escritura a flash por la mitad y corromper la
  // sesion que se esta grabando.
  static constexpr uint16_t kCriticalMv = 3400;
  bool isCritical() const { return mv_ > 0 && mv_ < kCriticalMv; }

  // Conversion pura, expuesta para los tests.
  static uint8_t millivoltsToPercent(uint16_t mv);

 private:
  uint8_t hysteresis_ = 2;
  uint8_t reported_pct_ = 0;
  uint16_t mv_ = 0;
  bool charging_ = false;
  bool first_ = true;
};

}  // namespace app
}  // namespace vbt
