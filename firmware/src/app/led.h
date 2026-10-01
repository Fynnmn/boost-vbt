// Control del LED RGB integrado en la XIAO nRF52840.
//
// Logica pura: dado un patron y el tiempo, devuelve la intensidad que tiene
// que tener cada color. No toca pines. La capa de plataforma la aplica.
//
// OJO CON EL CABLEADO: el LED RGB de la XIAO es de ANODO COMUN. Los tres
// catodos van a GPIOs, asi que **poner el pin en LOW enciende** y HIGH apaga.
// Es al reves de lo que uno espera y es el error clasico de esta placa: se
// prende todo al arrancar y queda apagado cuando deberia iluminar.
//
// Este modulo devuelve intensidad "logica" (0 = apagado, 255 = maximo). La
// inversion se hace UNA sola vez, en la capa de plataforma:
//
//     analogWrite(PIN_LED_R, 255 - out.r);
//
// La cuenta esta escrita aca a proposito, para que el dia que el LED quede al
// reves alguien lea este comentario antes de perder una hora.

#pragma once

#include <stdint.h>

#include "app/state_machine.h"

namespace vbt {
namespace app {

struct LedOutput {
  uint8_t r = 0, g = 0, b = 0;

  bool operator==(const LedOutput &o) const {
    return r == o.r && g == o.g && b == o.b;
  }
  bool isOff() const { return r == 0 && g == 0 && b == 0; }
};

class LedController {
 public:
  // brightness: 0-255. Escala todos los colores. El default de 40 es bajo a
  // proposito: el LED se mira de cerca, en un gimnasio iluminado, y a fondo
  // encandila y gasta ~10 mA al pedo.
  void configure(uint8_t brightness);

  LedOutput update(LedPattern pattern, uint32_t now_ms);

  // Periodos de cada patron, en ms. Expuestos para los tests y para poder
  // razonar sobre el consumo promedio.
  static constexpr uint32_t kBlinkPeriodMs = 1000;      // azul buscando
  static constexpr uint32_t kFastBlinkPeriodMs = 250;   // calibrando
  static constexpr uint32_t kSlowBlinkPeriodMs = 2000;  // bateria baja
  static constexpr uint32_t kErrorPeriodMs = 200;       // error

  // Fraccion del periodo que el LED esta encendido. Los parpadeos usan un
  // ciclo corto: un LED encendido al 10% del tiempo consume la decima parte,
  // y se ve igual de bien.
  static constexpr uint8_t kBlinkDutyPercent = 10;

 private:
  static bool blinkOn(uint32_t now_ms, uint32_t period_ms, uint8_t duty_pct);
  uint8_t scale(uint8_t value) const;

  uint8_t brightness_ = 40;
};

}  // namespace app
}  // namespace vbt
