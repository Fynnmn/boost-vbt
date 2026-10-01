#include "app/log_dumper.h"

namespace vbt {
namespace app {

void LogDumper::begin(LogStore &log, ble::VbtService &svc) {
  log_ = &log;
  svc_ = &svc;
  modo_ = Modo::kNada;
  error_ = VBT_ERR_NONE;
}

vbt_error_t LogDumper::empezar(uint16_t indice) {
  if (!log_ || !svc_) return VBT_ERR_QSPI;
  error_ = VBT_ERR_NONE;

  // Grabando no se vuelca: leer y escribir la misma flash a la vez pelea por
  // el bus y puede devolver un sector a medio escribir.
  if (log_->isRecording() || log_->isErasing()) {
    error_ = VBT_ERR_QSPI;
    return error_;
  }
  if (indice >= log_->sessionCount()) {
    error_ = VBT_ERR_BAD_PARAM;
    return error_;
  }

  SessionHeader hdr{};
  if (!log_->readHeader(indice, hdr)) {
    error_ = VBT_ERR_QSPI;
    return error_;
  }

  // Una sesion abierta tiene sample_count en 0xFFFFFFFF: se corto la energia
  // en el medio. Volcarla mandaria basura hasta el final de la flash, y el
  // archivo resultante parecería valido. Se rechaza.
  if (hdr.sample_count == kSessionOpen) {
    error_ = VBT_ERR_QSPI;
    return error_;
  }

  // El header va primero porque ES el header del archivo .vbt: la app copia
  // los bytes y ya tiene un archivo valido, sin conversion.
  if (!svc_->notifyLogHeader((const uint8_t *)&hdr)) {
    // Casi siempre es MTU: 8 + 32 bytes no entran en el MTU por defecto de 23.
    error_ = VBT_ERR_MTU;
    return error_;
  }

  modo_ = Modo::kSesion;
  sesion_ = indice;
  offset_ = 0;
  total_ = 0;
  bytes_ = hdr.sample_count * sizeof(vbt_sample_t);
  return VBT_ERR_NONE;
}

void LogDumper::empezarIndice() {
  if (!log_ || !svc_) return;
  error_ = VBT_ERR_NONE;
  modo_ = Modo::kIndice;
  sesion_ = 0;
  total_ = 0;
}

bool LogDumper::paso(bool conectado) {
  if (modo_ == Modo::kNada) return false;

  if (!conectado) {
    modo_ = Modo::kNada;
    return false;
  }

  if (modo_ == Modo::kIndice) {
    if (sesion_ >= log_->sessionCount()) {
      svc_->notifyLogEnd(log_->sessionCount());
      modo_ = Modo::kNada;
      return false;
    }
    SessionHeader hdr{};
    if (log_->readHeader(sesion_, hdr)) {
      // Si la cola esta llena se reintenta la misma sesion en la vuelta
      // siguiente en vez de saltearla: un indice al que le falta una entrada
      // es peor que uno que tarda un poco mas.
      if (!svc_->notifyLogHeader((const uint8_t *)&hdr)) return true;
    }
    sesion_++;
    return true;
  }

  if (offset_ >= bytes_) {
    svc_->notifyLogEnd(total_);
    modo_ = Modo::kNada;
    return false;
  }

  int16_t buf[VBT_BATCH_MAX_SAMPLES * 6];
  uint32_t quedan = bytes_ - offset_;
  uint32_t pedir = sizeof(buf);
  if (pedir > quedan) pedir = quedan;

  const uint32_t leidos =
      log_->readSamples(sesion_, offset_, (uint8_t *)buf, pedir);
  if (leidos == 0) {
    // La flash dejo de responder en la mitad. Se corta y se avisa, en vez de
    // cerrar el volcado como si hubiera terminado bien: un archivo truncado
    // que se presenta como completo envenena el dataset en silencio.
    error_ = VBT_ERR_QSPI;
    modo_ = Modo::kNada;
    return false;
  }

  const uint8_t n = (uint8_t)(leidos / sizeof(vbt_sample_t));
  const uint8_t enviadas = svc_->notifyLogSamples(buf, n);

  // Si la cola de notificaciones esta llena, `enviadas` es 0: se reintenta el
  // mismo tramo. Avanzar el offset igual perderia muestras en silencio, que
  // es el peor final posible para un dataset.
  if (enviadas == 0) return true;

  offset_ += enviadas * sizeof(vbt_sample_t);
  total_ += enviadas;
  return true;
}

uint8_t LogDumper::porcentaje() const {
  if (modo_ != Modo::kSesion || bytes_ == 0) return 0;
  if (offset_ >= bytes_) return 100;
  return (uint8_t)((offset_ * 100u) / bytes_);
}

}  // namespace app
}  // namespace vbt
