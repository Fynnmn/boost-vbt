// Interfaz de la memoria flash QSPI.
//
// El log_store habla contra esto y no contra el driver real, para poder
// testearlo en la PC con un flash simulado. El simulado del test respeta la
// regla que define a una NOR: escribir solo puede pasar bits de 1 a 0, y para
// volver a ponerlos en 1 hay que borrar el sector entero. Un simulado que
// permita sobrescribir cualquier cosa esconde justo los bugs que despues
// aparecen en el hardware.

#pragma once

#include <stdint.h>

namespace vbt {

class IFlash {
 public:
  virtual ~IFlash() = default;

  virtual uint32_t size() const = 0;        // bytes totales
  virtual uint32_t sectorSize() const = 0;  // unidad minima de borrado
  virtual uint32_t pageSize() const = 0;    // unidad maxima de escritura

  virtual bool read(uint32_t addr, uint8_t *buf, uint32_t len) = 0;

  // Escribe hasta pageSize() bytes. NO puede cruzar el limite de una pagina:
  // el chip da la vuelta al principio de la misma pagina y corrompe datos en
  // silencio. Quien llama tiene que respetarlo.
  virtual bool writePage(uint32_t addr, const uint8_t *buf, uint32_t len) = 0;

  virtual bool eraseSector(uint32_t addr) = 0;

  // Baja consumo. Sin esto el QSPI se come ~450 uA en reposo, que arruina la
  // autonomia del modo Sleep entero.
  virtual bool powerDown() = 0;
  virtual bool powerUp() = 0;
};

}  // namespace vbt
