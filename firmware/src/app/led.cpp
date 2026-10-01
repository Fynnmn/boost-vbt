#include "app/led.h"

namespace vbt {
namespace app {

void LedController::configure(uint8_t brightness) { brightness_ = brightness; }

uint8_t LedController::scale(uint8_t value) const {
  return (uint8_t)(((uint16_t)value * brightness_) / 255u);
}

bool LedController::blinkOn(uint32_t now_ms, uint32_t period_ms,
                            uint8_t duty_pct) {
  if (period_ms == 0) return true;
  const uint32_t fase = now_ms % period_ms;
  return fase < (period_ms * duty_pct) / 100u;
}

LedOutput LedController::update(LedPattern pattern, uint32_t now_ms) {
  LedOutput out;

  switch (pattern) {
    case LedPattern::kOff:
      break;

    case LedPattern::kBlueBlink:
      if (blinkOn(now_ms, kBlinkPeriodMs, kBlinkDutyPercent)) {
        out.b = scale(255);
      }
      break;

    case LedPattern::kBlueFastBlink:
      // Calibrando. Rapido para que se note que esta pasando algo y que hay
      // que esperar un segundo, sin que parezca un error.
      if (blinkOn(now_ms, kFastBlinkPeriodMs, 50)) out.b = scale(255);
      break;

    case LedPattern::kBlueSolid:
      out.b = scale(255);
      break;

    case LedPattern::kGreen:
      // Grabando. Fijo, porque es el estado en el que el usuario mira el
      // sensor de reojo entre repeticiones y necesita una respuesta sin
      // ambiguedad.
      out.g = scale(255);
      break;

    case LedPattern::kGreenBlink:
      if (blinkOn(now_ms, kBlinkPeriodMs, 50)) out.g = scale(255);
      break;

    case LedPattern::kRedSlowBlink:
      // Bateria baja: lento y corto. Es un aviso, no una alarma, y tiene que
      // costar lo menos posible justo cuando queda poca bateria.
      if (blinkOn(now_ms, kSlowBlinkPeriodMs, 5)) out.r = scale(255);
      break;

    case LedPattern::kRedFastBlink:
      if (blinkOn(now_ms, kErrorPeriodMs, 50)) out.r = scale(255);
      break;
  }

  return out;
}

}  // namespace app
}  // namespace vbt
