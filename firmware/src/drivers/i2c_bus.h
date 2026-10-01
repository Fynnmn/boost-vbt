// Interfaz del bus I2C.
//
// El driver del IMU habla contra esto y no contra Wire, para que se pueda
// compilar y testear en la PC con un bus falso. Sin esta capa, verificar el
// driver requeriria tener la placa en la mano -- y la placa llega en septiembre.

#pragma once

#include <stdint.h>

namespace vbt {

class II2CBus {
 public:
  virtual ~II2CBus() = default;

  // Devuelven true si la transaccion fue reconocida por el esclavo.
  virtual bool write(uint8_t addr, uint8_t reg, const uint8_t *data,
                     uint16_t len) = 0;
  virtual bool read(uint8_t addr, uint8_t reg, uint8_t *data, uint16_t len) = 0;

  bool writeReg(uint8_t addr, uint8_t reg, uint8_t value) {
    return write(addr, reg, &value, 1);
  }

  bool readReg(uint8_t addr, uint8_t reg, uint8_t *value) {
    return read(addr, reg, value, 1);
  }

  // Aca adentro a proposito: el driver necesita esperar despues del reset y
  // despues de encender el IMU, y no puede llamar a delay() de Arduino sin
  // arrastrar todo el framework al build de PC.
  virtual void delayMs(uint32_t ms) = 0;

  // Microsegundos desde el arranque. El driver la usa para poner timestamp a
  // los lotes de muestras.
  virtual uint32_t microsSinceBoot() = 0;
};

}  // namespace vbt
