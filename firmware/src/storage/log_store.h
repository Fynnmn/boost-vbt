// Grabador de muestras crudas en la flash QSPI.
//
// Es la ruta critica del proyecto: sin esto no hay dataset, y sin dataset no
// se puede calibrar el algoritmo contra nada real.
//
// Decision de diseno: cuando la flash se llena, la grabacion SE DETIENE y se
// avisa. No es un ring buffer que sobrescribe lo viejo.
//
// Un ring parece mas prolijo pero es peor aca: si se llena a mitad de una
// sesion de gimnasio, te deja el final y se come el principio SIN AVISAR, y
// uno se entera en la PC cuando ya no puede volver a grabar esa sesion.
// Detenerse y encender el LED es feo y honesto: sabes en el momento que hay
// que descargar y borrar.

#pragma once

#include <stdint.h>

#include "algo/types.h"
#include "storage/flash.h"

namespace vbt {

// Header de sesion, 32 bytes. Es EXACTAMENTE el mismo formato del archivo
// .vbt (ver docs/DATASET.md), asi que dump_log.py copia los bytes y ya tiene
// un archivo valido, sin conversion ni oportunidad de equivocarse.
#pragma pack(push, 1)
struct SessionHeader {
  char magic[4];             // "VBT1"
  uint16_t format_version;
  uint16_t odr_hz;
  uint8_t accel_fs_g;
  uint16_t gyro_fs_dps;
  uint8_t exercise_id;
  uint32_t sample_count;     // 0xFFFFFFFF mientras la sesion esta abierta
  uint32_t t0_unix;
  uint16_t load_kg_x10;
  uint8_t origin;            // 0 = sensor real, 1 = sintetico
  uint8_t reserved[9];
};
#pragma pack(pop)

constexpr uint32_t kSessionOpen = 0xFFFFFFFFu;
constexpr uint16_t kLogFormatVersion = 1;

class LogStore {
 public:
  bool begin(IFlash &flash);

  // Abre una sesion nueva, alineada al proximo sector libre.
  // Devuelve false si no queda espacio.
  bool startSession(const SessionHeader &hdr);

  // Agrega muestras. Devuelve false si se lleno: a partir de ahi deja de
  // escribir y isFull() queda en true.
  bool write(const algo::Sample *samples, uint16_t n);
  bool writeRaw(const int16_t *xyz6, uint16_t n_samples);

  // Cierra la sesion y escribe la cantidad real de muestras en el header.
  bool endSession();

  bool isRecording() const { return recording_; }
  bool isFull() const { return full_; }
  uint32_t freeBytes() const;
  uint32_t usedBytes() const { return write_addr_; }
  uint16_t sessionCount() const { return session_count_; }
  uint32_t sampleCount() const { return sample_count_; }

  // --- Lectura ---------------------------------------------------------
  bool readHeader(uint16_t index, SessionHeader &out);
  // Lee un tramo de muestras de una sesion. Devuelve bytes leidos.
  uint32_t readSamples(uint16_t index, uint32_t offset_bytes, uint8_t *buf,
                       uint32_t len);

  // Borra todo. Es lento (decenas de segundos con 2 MB), asi que borra de a
  // un sector por llamada y devuelve false hasta terminar. Asi el firmware
  // puede seguir parpadeando el LED en vez de quedarse mudo.
  bool eraseStep();
  void beginErase();
  bool isErasing() const { return erasing_; }
  uint8_t erasePercent() const;

 private:
  bool flushPage();
  uint32_t sectorAlign(uint32_t addr) const;
  bool scanSessions();

  IFlash *flash_ = nullptr;
  uint32_t write_addr_ = 0;
  uint32_t session_addr_ = 0;
  uint32_t sample_count_ = 0;
  uint16_t session_count_ = 0;
  bool recording_ = false;
  bool full_ = false;

  bool erasing_ = false;
  uint32_t erase_addr_ = 0;

  // Buffer de una pagina. Las muestras son de 12 bytes y la pagina de 256,
  // asi que una muestra puede quedar partida entre dos paginas. No es
  // problema: la lectura es secuencial y las reconstituye.
  static constexpr uint32_t kMaxPage = 256;
  uint8_t page_[kMaxPage];
  uint32_t page_len_ = 0;
};

}  // namespace vbt
