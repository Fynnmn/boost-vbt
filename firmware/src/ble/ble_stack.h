// Interfaz del stack BLE.
//
// El servicio VBT habla contra esto y no contra Bluefruit directamente, por la
// misma razon que el driver del IMU habla contra un bus abstracto: para poder
// probar en la PC que los payloads salen bien armados, que un comando basura
// no cuelga el firmware, y que todo sigue funcionando si la negociacion de MTU
// falla. Nada de eso necesita una radio.

#pragma once

#include <stdint.h>

namespace vbt {
namespace ble {

// Identifica una characteristic sin arrastrar los tipos de Bluefruit.
enum class Chr : uint8_t {
  kRepResult = 0,
  kSetSummary,
  kControl,
  kConfig,
  kStatus,
  kRawStream,
  kLogDump,
  kBatteryLevel,  // 0x2A19 del Battery Service estandar
};

class IBleStack {
 public:
  virtual ~IBleStack() = default;

  // Devuelve false si no hay nadie conectado o si la notificacion no entra.
  virtual bool notify(Chr c, const uint8_t *data, uint16_t len) = 0;

  // Deja un valor disponible para cuando el central lo lea.
  virtual bool setValue(Chr c, const uint8_t *data, uint16_t len) = 0;

  virtual bool isConnected() const = 0;

  // MTU negociado. 23 es el minimo garantizado por la spec; el firmware pide
  // 247 para los lotes de datos crudos, pero tiene que seguir funcionando si
  // el central no lo concede.
  virtual uint16_t mtu() const = 0;

  virtual void startAdvertising() = 0;
  virtual void stopAdvertising() = 0;
};

// Payload util de una notificacion: el MTU menos los 3 bytes de encabezado ATT.
inline uint16_t usablePayload(uint16_t mtu) {
  return mtu > 3 ? (uint16_t)(mtu - 3) : 0;
}

}  // namespace ble
}  // namespace vbt
