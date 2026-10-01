#include "app/battery.h"

namespace vbt {
namespace app {
namespace {

// Curva de descarga de una LiPo de un solo elemento, con carga liviana.
//
// NO es lineal, y esa es la razon de usar tabla y no una regla de tres. Entre
// 4,2 V y 3,7 V se consume el 80% de la capacidad; de 3,7 V para abajo la
// tension se desploma. Con interpolacion lineal entre 4,2 y 3,3 el sensor
// diria "50%" cuando en realidad queda el 5% y se apaga a los diez minutos.
struct Punto {
  uint16_t mv;
  uint8_t pct;
};

constexpr Punto kCurva[] = {
    {4200, 100}, {4150, 95}, {4110, 90}, {4080, 85}, {4020, 80},
    {3980, 75},  {3950, 70}, {3910, 65}, {3870, 60}, {3850, 55},
    {3840, 50},  {3820, 45}, {3800, 40}, {3790, 35}, {3770, 30},
    {3750, 25},  {3730, 20}, {3710, 15}, {3690, 10}, {3610, 5},
    {3400, 0},
};

constexpr int kCurvaN = (int)(sizeof(kCurva) / sizeof(kCurva[0]));

}  // namespace

uint8_t BatteryMonitor::millivoltsToPercent(uint16_t mv) {
  if (mv >= kCurva[0].mv) return 100;
  if (mv <= kCurva[kCurvaN - 1].mv) return 0;

  for (int i = 1; i < kCurvaN; ++i) {
    if (mv >= kCurva[i].mv) {
      // Interpolacion lineal dentro del tramo, que si es una buena
      // aproximacion en un intervalo chico.
      const Punto &alto = kCurva[i - 1];
      const Punto &bajo = kCurva[i];
      const uint16_t rango_mv = alto.mv - bajo.mv;
      const uint8_t rango_pct = alto.pct - bajo.pct;
      if (rango_mv == 0) return bajo.pct;
      return (uint8_t)(bajo.pct + ((uint32_t)(mv - bajo.mv) * rango_pct) / rango_mv);
    }
  }
  return 0;
}

void BatteryMonitor::configure(uint8_t hysteresis_pct) {
  hysteresis_ = hysteresis_pct;
  reset();
}

void BatteryMonitor::reset() {
  reported_pct_ = 0;
  mv_ = 0;
  first_ = true;
}

void BatteryMonitor::update(uint16_t millivolts) {
  mv_ = millivolts;
  const uint8_t crudo = millivoltsToPercent(millivolts);

  if (first_) {
    reported_pct_ = crudo;
    first_ = false;
    return;
  }

  const int delta = (int)crudo - (int)reported_pct_;
  const int abs_delta = delta < 0 ? -delta : delta;

  // Histeresis: el porcentaje solo se mueve si el cambio es real. Sin esto
  // baila entre 71 y 72 con el ruido del ADC y parece que algo anda mal.
  if (abs_delta < (int)hysteresis_) return;

  // Descargando, el porcentaje nunca sube. Si el ADC leyo alto por ruido o
  // porque justo no habia consumo, subir el numero confunde: el usuario ve
  // que la bateria "se recupera" sola y deja de creerle al indicador.
  if (!charging_ && delta > 0) return;

  reported_pct_ = crudo;
}

}  // namespace app
}  // namespace vbt
