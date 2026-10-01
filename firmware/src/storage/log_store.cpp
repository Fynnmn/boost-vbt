#include "storage/log_store.h"

#include <stddef.h>
#include <string.h>

namespace vbt {
namespace {

// Cuentas del acelerometro y del giroscopio, tal como salen del IMU.
constexpr uint32_t kBytesPerSample = 12;

int16_t toCounts(float value, float lsb) {
  float c = value / lsb;
  if (c > 32767.0f) return 32767;
  if (c < -32768.0f) return -32768;
  return (int16_t)c;
}

}  // namespace

bool LogStore::begin(IFlash &flash) {
  flash_ = &flash;
  recording_ = false;
  full_ = false;
  erasing_ = false;
  page_len_ = 0;
  return scanSessions();
}

uint32_t LogStore::sectorAlign(uint32_t addr) const {
  const uint32_t s = flash_->sectorSize();
  return ((addr + s - 1) / s) * s;
}

bool LogStore::scanSessions() {
  // No hay indice mutable en flash a proposito. Mantener un indice que se
  // reescribe es complicado en una NOR (los bits solo bajan) y es justo lo
  // que se corrompe si se corta la energia. Escanear sectores al arrancar es
  // mas lento pero no puede quedar inconsistente.
  session_count_ = 0;
  write_addr_ = 0;

  const uint32_t sector = flash_->sectorSize();
  for (uint32_t addr = 0; addr + sizeof(SessionHeader) <= flash_->size();
       addr += sector) {
    SessionHeader h;
    if (!flash_->read(addr, (uint8_t *)&h, sizeof(h))) return false;
    if (memcmp(h.magic, "VBT1", 4) != 0) {
      // Primer sector sin sesion: aca sigue el espacio libre.
      write_addr_ = addr;
      return true;
    }
    session_count_++;

    uint32_t bytes;
    if (h.sample_count == kSessionOpen) {
      // Sesion que quedo abierta: se corto la energia o se quedo sin bateria
      // en medio de una grabacion. Los datos siguen ahi y valen; lo unico
      // que falta es el contador. Se estima ocupando hasta el proximo sector
      // libre y se deja que la PC decida hasta donde llega lo util.
      bytes = sector;
      while (addr + bytes + sizeof(SessionHeader) <= flash_->size()) {
        SessionHeader probe;
        flash_->read(addr + bytes, (uint8_t *)&probe, sizeof(probe));
        bool vacio = true;
        for (uint32_t i = 0; i < sizeof(probe); ++i) {
          if (((uint8_t *)&probe)[i] != 0xFF) {
            vacio = false;
            break;
          }
        }
        if (vacio) break;
        bytes += sector;
      }
    } else {
      bytes = sizeof(SessionHeader) + h.sample_count * kBytesPerSample;
    }
    addr = sectorAlign(addr + bytes) - sector;  // el for suma otro sector
  }

  write_addr_ = flash_->size();
  full_ = true;
  return true;
}

bool LogStore::startSession(const SessionHeader &hdr) {
  if (!flash_ || recording_ || erasing_) return false;

  // Cada sesion arranca alineada a sector. Se desperdicia algo de espacio
  // pero permite escanear de a sectores y borrar sesiones sueltas mas
  // adelante sin tocar las vecinas.
  const uint32_t start = sectorAlign(write_addr_);
  if (start + flash_->sectorSize() > flash_->size()) {
    full_ = true;
    return false;
  }

  SessionHeader h = hdr;
  memcpy(h.magic, "VBT1", 4);
  h.format_version = kLogFormatVersion;
  h.sample_count = kSessionOpen;  // se completa al cerrar
  h.origin = 0;                   // sensor real

  if (!flash_->writePage(start, (const uint8_t *)&h, sizeof(h))) return false;

  session_addr_ = start;
  write_addr_ = start + sizeof(SessionHeader);
  sample_count_ = 0;
  page_len_ = 0;
  recording_ = true;
  return true;
}

bool LogStore::flushPage() {
  if (page_len_ == 0) return true;

  // Se escriben exactamente los bytes acumulados, NO una pagina completa.
  //
  // Rellenar hasta 256 parece inofensivo porque el relleno seria 0xFF, que es
  // el estado borrado. Pero la primera escritura de cada sesion arranca en el
  // offset 32, justo despues del header: pedir 256 bytes desde ahi cruza el
  // limite de pagina, y en el chip real eso no falla -- da la vuelta al
  // principio de la misma pagina y pisa el header que se acaba de escribir.
  const uint32_t addr = write_addr_ - page_len_;
  if (!flash_->writePage(addr, page_, page_len_)) return false;
  page_len_ = 0;
  return true;
}

bool LogStore::writeRaw(const int16_t *xyz6, uint16_t n_samples) {
  if (!recording_ || full_) return false;

  const uint32_t page = flash_->pageSize();
  const uint8_t *src = (const uint8_t *)xyz6;
  uint32_t remaining = (uint32_t)n_samples * kBytesPerSample;

  while (remaining > 0) {
    if (write_addr_ + 1 > flash_->size()) {
      full_ = true;
      return false;
    }

    // Cuanto entra en lo que queda de la pagina actual.
    const uint32_t page_off = (write_addr_ % page);
    const uint32_t space = page - page_off;
    uint32_t chunk = remaining < space ? remaining : space;
    if (write_addr_ + chunk > flash_->size()) {
      chunk = flash_->size() - write_addr_;
      if (chunk == 0) {
        full_ = true;
        return false;
      }
    }

    memcpy(page_ + page_len_, src, chunk);
    page_len_ += chunk;
    write_addr_ += chunk;
    src += chunk;
    remaining -= chunk;

    if ((write_addr_ % page) == 0) {
      if (!flushPage()) return false;
    }
  }

  sample_count_ += n_samples;
  return true;
}

bool LogStore::write(const algo::Sample *samples, uint16_t n) {
  // Se guardan cuentas crudas, no unidades fisicas: ocupa la mitad, no
  // pierde precision y deja la saturacion visible.
  constexpr float kAccelLsb = 0.244f / 1000.0f;  // g por cuenta a +-8 g
  constexpr float kGyroLsb = 35.0f / 1000.0f;    // dps por cuenta a 1000 dps

  for (uint16_t i = 0; i < n; ++i) {
    int16_t raw[6] = {
        toCounts(samples[i].ax, kAccelLsb), toCounts(samples[i].ay, kAccelLsb),
        toCounts(samples[i].az, kAccelLsb), toCounts(samples[i].gx, kGyroLsb),
        toCounts(samples[i].gy, kGyroLsb),  toCounts(samples[i].gz, kGyroLsb)};
    if (!writeRaw(raw, 1)) return false;
  }
  return true;
}

bool LogStore::endSession() {
  if (!recording_) return false;
  if (!flushPage()) return false;

  // Escribir el contador real sobre el 0xFFFFFFFF del header. Es una
  // operacion valida en NOR: los bits solo bajan de 1 a 0, y partiendo de
  // todos unos se puede escribir cualquier valor una sola vez.
  const uint32_t offset = session_addr_ + offsetof(SessionHeader, sample_count);
  if (!flash_->writePage(offset, (const uint8_t *)&sample_count_, 4)) {
    return false;
  }

  recording_ = false;
  session_count_++;
  write_addr_ = sectorAlign(write_addr_);
  return true;
}

uint32_t LogStore::freeBytes() const {
  if (!flash_ || write_addr_ >= flash_->size()) return 0;
  return flash_->size() - write_addr_;
}

bool LogStore::readHeader(uint16_t index, SessionHeader &out) {
  if (!flash_) return false;
  const uint32_t sector = flash_->sectorSize();
  uint16_t seen = 0;

  for (uint32_t addr = 0; addr + sizeof(SessionHeader) <= flash_->size();
       addr += sector) {
    SessionHeader h;
    if (!flash_->read(addr, (uint8_t *)&h, sizeof(h))) return false;
    if (memcmp(h.magic, "VBT1", 4) != 0) return false;

    if (seen == index) {
      out = h;
      return true;
    }
    seen++;

    const uint32_t bytes =
        sizeof(SessionHeader) +
        (h.sample_count == kSessionOpen ? 0 : h.sample_count * kBytesPerSample);
    addr = sectorAlign(addr + bytes) - sector;
  }
  return false;
}

uint32_t LogStore::readSamples(uint16_t index, uint32_t offset_bytes,
                               uint8_t *buf, uint32_t len) {
  if (!flash_) return 0;
  const uint32_t sector = flash_->sectorSize();
  uint16_t seen = 0;

  for (uint32_t addr = 0; addr + sizeof(SessionHeader) <= flash_->size();
       addr += sector) {
    SessionHeader h;
    if (!flash_->read(addr, (uint8_t *)&h, sizeof(h))) return 0;
    if (memcmp(h.magic, "VBT1", 4) != 0) return 0;

    if (seen == index) {
      if (h.sample_count == kSessionOpen) return 0;
      const uint32_t total = h.sample_count * kBytesPerSample;
      if (offset_bytes >= total) return 0;
      uint32_t n = len;
      if (offset_bytes + n > total) n = total - offset_bytes;
      const uint32_t src = addr + sizeof(SessionHeader) + offset_bytes;
      return flash_->read(src, buf, n) ? n : 0;
    }
    seen++;

    const uint32_t bytes =
        sizeof(SessionHeader) +
        (h.sample_count == kSessionOpen ? 0 : h.sample_count * kBytesPerSample);
    addr = sectorAlign(addr + bytes) - sector;
  }
  return 0;
}

void LogStore::beginErase() {
  if (recording_) endSession();
  erasing_ = true;
  erase_addr_ = 0;
}

bool LogStore::eraseStep() {
  if (!erasing_ || !flash_) return true;

  // Un sector por llamada. Borrar 2 MB son decenas de segundos: hacerlo de
  // un saque dejaria el firmware mudo, sin LED ni BLE, y parece colgado.
  if (!flash_->eraseSector(erase_addr_)) return false;
  erase_addr_ += flash_->sectorSize();

  if (erase_addr_ >= flash_->size()) {
    erasing_ = false;
    write_addr_ = 0;
    session_count_ = 0;
    sample_count_ = 0;
    full_ = false;
    page_len_ = 0;
    return true;
  }
  return false;
}

uint8_t LogStore::erasePercent() const {
  if (!erasing_ || !flash_) return 100;
  return (uint8_t)((uint64_t)erase_addr_ * 100u / flash_->size());
}

}  // namespace vbt
