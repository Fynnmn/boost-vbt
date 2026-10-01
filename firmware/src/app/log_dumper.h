// Volcado del log interno por BLE.
//
// Vive aparte de main.cpp a proposito: main.cpp necesita Arduino y no lo
// compila el build de PC, asi que todo lo que viva ahi queda sin una sola
// prueba. Y esta es justo la parte con los casos que importan — una sesion
// que quedo abierta, la cola de notificaciones llena, la flash que deja de
// responder en la mitad. Aca se puede probar contra un stack falso.
//
// Se manda de a un lote por llamada, nunca en un bucle que bloquea. Un
// volcado son megabytes: hacerlo de una deja al sensor sordo a los comandos
// durante minutos, sin poder cancelar ni atender una desconexion, que desde
// afuera se ve exactamente igual que colgado.

#pragma once

#include <stdint.h>

#include "ble/protocol.h"
#include "ble/vbt_service.h"
#include "storage/log_store.h"

namespace vbt {
namespace app {

class LogDumper {
 public:
  enum class Modo : uint8_t { kNada, kSesion, kIndice };

  void begin(LogStore &log, ble::VbtService &svc);

  // Arranca el volcado de una sesion. Devuelve el error si no se puede.
  vbt_error_t empezar(uint16_t indice);

  // Arranca la enumeracion de sesiones (LOG_LIST).
  void empezarIndice();

  // Un paso. Devuelve true mientras quede algo por mandar.
  // `conectado` viene de afuera porque si se corto la conexion no tiene
  // sentido seguir leyendo la flash: gasta bateria mandando a nadie.
  bool paso(bool conectado);

  void cancelar() { modo_ = Modo::kNada; }

  bool activo() const { return modo_ != Modo::kNada; }
  Modo modo() const { return modo_; }
  uint32_t enviadas() const { return total_; }
  vbt_error_t error() const { return error_; }

  // Cuanto del volcado va hecho, 0-100. Para el LED y para la app.
  uint8_t porcentaje() const;

 private:
  LogStore *log_ = nullptr;
  ble::VbtService *svc_ = nullptr;

  Modo modo_ = Modo::kNada;
  uint16_t sesion_ = 0;      // indice de la sesion en curso
  uint32_t offset_ = 0;      // bytes ya enviados de esa sesion
  uint32_t total_ = 0;       // muestras enviadas, para el cierre
  uint32_t bytes_ = 0;       // bytes que tiene la sesion
  vbt_error_t error_ = VBT_ERR_NONE;
};

}  // namespace app
}  // namespace vbt
