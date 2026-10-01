// Verifica el logger contra una flash simulada.
//
// El simulado respeta la regla que define a una NOR: escribir solo baja bits
// de 1 a 0, y para volver a subirlos hay que borrar el sector. Cualquier
// intento de subir un bit se cuenta como violacion y hace fallar el test.
//
// Sin esa regla, un simulado deja pasar codigo que reescribe campos alegremente
// y funciona perfecto en la PC -- para despues corromper datos en el hardware
// real de una forma que solo se nota cuando ya perdiste una sesion de gimnasio.

#include "storage/log_store.h"

#include <cstdio>
#include <cstring>
#include <vector>

using namespace vbt;

namespace {

int fallas = 0;

void check(bool cond, const char *msg) {
  if (!cond) {
    printf("  FALLA  %s\n", msg);
    fallas++;
  }
}

class FakeFlash : public IFlash {
 public:
  std::vector<uint8_t> mem;
  uint32_t sector_size, page_size;
  int violaciones_nor = 0;
  int cruces_de_pagina = 0;
  int erases = 0;
  bool powered = true;

  FakeFlash(uint32_t total, uint32_t sector = 4096, uint32_t page = 256)
      : mem(total, 0xFF), sector_size(sector), page_size(page) {}

  uint32_t size() const override { return (uint32_t)mem.size(); }
  uint32_t sectorSize() const override { return sector_size; }
  uint32_t pageSize() const override { return page_size; }

  bool read(uint32_t addr, uint8_t *buf, uint32_t len) override {
    if (addr + len > mem.size()) return false;
    memcpy(buf, mem.data() + addr, len);
    return true;
  }

  bool writePage(uint32_t addr, const uint8_t *buf, uint32_t len) override {
    if (addr + len > mem.size()) return false;
    if (len > page_size) return false;
    // Una escritura no puede cruzar el limite de pagina: el chip da la vuelta
    // al principio de la misma pagina y corrompe datos sin avisar.
    if ((addr % page_size) + len > page_size) {
      cruces_de_pagina++;
      return false;
    }
    for (uint32_t i = 0; i < len; ++i) {
      const uint8_t viejo = mem[addr + i];
      const uint8_t nuevo = buf[i];
      // Subir un bit de 0 a 1 sin borrar es imposible en una NOR.
      if ((nuevo & viejo) != nuevo) violaciones_nor++;
      mem[addr + i] = viejo & nuevo;
    }
    return true;
  }

  bool eraseSector(uint32_t addr) override {
    if (addr % sector_size != 0) return false;
    if (addr + sector_size > mem.size()) return false;
    memset(mem.data() + addr, 0xFF, sector_size);
    erases++;
    return true;
  }

  bool powerDown() override { powered = false; return true; }
  bool powerUp() override { powered = true; return true; }
};

SessionHeader makeHeader(uint8_t exercise = 1, float load_kg = 80.0f) {
  SessionHeader h{};
  memcpy(h.magic, "VBT1", 4);
  h.format_version = 1;
  h.odr_hz = 208;
  h.accel_fs_g = 8;
  h.gyro_fs_dps = 1000;
  h.exercise_id = exercise;
  h.t0_unix = 1789000000u;
  h.load_kg_x10 = (uint16_t)(load_kg * 10);
  return h;
}

void fillSamples(std::vector<int16_t> &v, uint16_t n, int16_t base) {
  v.clear();
  for (uint16_t i = 0; i < n; ++i) {
    v.push_back((int16_t)(base + i));
    v.push_back((int16_t)(base + i + 1));
    v.push_back(4096);
    v.push_back(1);
    v.push_back(2);
    v.push_back(3);
  }
}

void test_vacio() {
  FakeFlash f(64 * 1024);
  LogStore log;
  check(log.begin(f), "begin deberia funcionar en flash borrada");
  check(log.sessionCount() == 0, "flash borrada no tiene sesiones");
  check(log.freeBytes() == 64 * 1024, "flash borrada esta entera libre");
  check(!log.isRecording(), "no deberia estar grabando");
}

void test_sesion_completa() {
  FakeFlash f(64 * 1024);
  LogStore log;
  log.begin(f);

  check(log.startSession(makeHeader()), "startSession deberia funcionar");
  check(log.isRecording(), "deberia estar grabando");

  // El header arranca con el contador en 0xFFFFFFFF: todavia no se sabe
  // cuantas muestras va a tener, y en una NOR no se puede reescribir despues
  // si se pone otra cosa.
  SessionHeader raw{};
  f.read(0, (uint8_t *)&raw, sizeof(raw));
  check(memcmp(raw.magic, "VBT1", 4) == 0, "el magic no quedo escrito");
  check(raw.sample_count == kSessionOpen,
        "la sesion abierta tiene que tener el contador en 0xFFFFFFFF");
  check(raw.odr_hz == 208, "el ODR no quedo guardado");

  std::vector<int16_t> muestras;
  fillSamples(muestras, 300, 100);
  check(log.writeRaw(muestras.data(), 300), "write de 300 muestras");
  check(log.sampleCount() == 300, "contador de muestras");

  check(log.endSession(), "endSession deberia funcionar");
  check(!log.isRecording(), "ya no deberia estar grabando");

  f.read(0, (uint8_t *)&raw, sizeof(raw));
  check(raw.sample_count == 300,
        "el contador real tiene que quedar escrito al cerrar");

  check(f.violaciones_nor == 0,
        "se intento subir un bit sin borrar: eso en el chip real corrompe");
  check(f.cruces_de_pagina == 0,
        "una escritura cruzo el limite de pagina");

  // Los datos tienen que volver identicos.
  SessionHeader h;
  check(log.readHeader(0, h), "readHeader");
  check(h.sample_count == 300, "el header leido no coincide");

  std::vector<uint8_t> buf(300 * 12);
  const uint32_t leidos = log.readSamples(0, 0, buf.data(), (uint32_t)buf.size());
  check(leidos == 300 * 12, "readSamples devolvio menos de lo escrito");
  check(memcmp(buf.data(), muestras.data(), buf.size()) == 0,
        "los datos leidos no son los que se escribieron");
}

void test_muchas_sesiones() {
  FakeFlash f(64 * 1024);
  LogStore log;
  log.begin(f);

  std::vector<int16_t> m;
  for (int i = 0; i < 3; ++i) {
    check(log.startSession(makeHeader((uint8_t)(i + 1), 60.0f + i * 10)),
          "startSession de sesion multiple");
    fillSamples(m, (uint16_t)(50 + i * 20), (int16_t)(i * 1000));
    log.writeRaw(m.data(), (uint16_t)(50 + i * 20));
    check(log.endSession(), "endSession de sesion multiple");
  }
  check(log.sessionCount() == 3, "tendria que haber 3 sesiones");

  for (int i = 0; i < 3; ++i) {
    SessionHeader h;
    check(log.readHeader((uint16_t)i, h), "readHeader de sesion multiple");
    check(h.exercise_id == i + 1, "las sesiones se mezclaron");
    check(h.sample_count == (uint32_t)(50 + i * 20),
          "la cantidad de muestras no coincide");
  }

  // Reabrir desde cero tiene que reconstruir el estado leyendo la flash.
  // Es lo que pasa cada vez que el sensor arranca.
  LogStore log2;
  check(log2.begin(f), "begin sobre una flash con datos");
  check(log2.sessionCount() == 3,
        "al reiniciar no encontro las sesiones que ya estaban");
  check(f.violaciones_nor == 0, "violacion de NOR con sesiones multiples");
}

void test_sesion_abierta() {
  // Se corto la energia en medio de una grabacion: el header quedo abierto.
  // Los datos siguen ahi y valen; lo que falta es el contador.
  FakeFlash f(64 * 1024);
  {
    LogStore log;
    log.begin(f);
    log.startSession(makeHeader());
    std::vector<int16_t> m;
    fillSamples(m, 100, 7);
    log.writeRaw(m.data(), 100);
    // sin endSession(), a proposito
  }

  LogStore log2;
  check(log2.begin(f), "begin con una sesion abierta");
  check(log2.sessionCount() == 1, "la sesion abierta tiene que contarse igual");

  SessionHeader h;
  check(log2.readHeader(0, h), "readHeader de sesion abierta");
  check(h.sample_count == kSessionOpen,
        "la sesion abierta tiene que quedar marcada como tal");

  // Y una sesion nueva no puede pisar la anterior.
  check(log2.startSession(makeHeader(2)), "startSession despues de una abierta");
  check(log2.endSession(), "endSession despues de una abierta");
  check(f.violaciones_nor == 0,
        "la sesion nueva piso datos de la anterior sin borrar");
}

void test_se_llena() {
  // Flash chica a proposito para llegar al limite rapido.
  FakeFlash f(8 * 1024);
  LogStore log;
  log.begin(f);
  check(log.startSession(makeHeader()), "startSession en flash chica");

  std::vector<int16_t> m;
  fillSamples(m, 100, 1);
  int escrituras_ok = 0;
  for (int i = 0; i < 20; ++i) {
    if (log.writeRaw(m.data(), 100)) escrituras_ok++;
  }

  check(log.isFull(), "tendria que haberse marcado como llena");
  check(escrituras_ok < 20, "acepto mas datos de los que entran");
  check(log.freeBytes() == 0, "freeBytes tendria que ser 0");
  check(!log.writeRaw(m.data(), 1),
        "una vez llena no puede seguir aceptando datos");
  check(f.violaciones_nor == 0, "escribio fuera de lo borrado al llenarse");
  check(log.usedBytes() <= 8 * 1024, "escribio mas alla del final de la flash");
}

void test_borrado_por_pasos() {
  FakeFlash f(16 * 1024);
  LogStore log;
  log.begin(f);
  log.startSession(makeHeader());
  std::vector<int16_t> m;
  fillSamples(m, 50, 5);
  log.writeRaw(m.data(), 50);
  log.endSession();
  check(log.sessionCount() == 1, "deberia haber una sesion antes de borrar");

  log.beginErase();
  check(log.isErasing(), "deberia estar borrando");

  int pasos = 0;
  while (!log.eraseStep() && pasos < 100) pasos++;

  check(!log.isErasing(), "el borrado tendria que haber terminado");
  check(pasos == (int)(16 * 1024 / f.sectorSize()) - 1,
        "borro una cantidad de sectores distinta de la esperada");
  check(f.erases == (int)(16 * 1024 / f.sectorSize()),
        "no borro todos los sectores");
  check(log.sessionCount() == 0, "quedaron sesiones despues de borrar");
  check(log.freeBytes() == 16 * 1024, "la flash no quedo entera libre");

  // Y despues de borrar tiene que poder grabar de nuevo.
  check(log.startSession(makeHeader()), "no pudo grabar despues de borrar");
}

void test_escritura_larga_alineacion() {
  // 208 Hz durante un rato: el caso real. Lo que se verifica es que ninguna
  // escritura cruce el limite de pagina, aunque las muestras de 12 bytes no
  // dividan justo a los 256 de la pagina.
  FakeFlash f(128 * 1024);
  LogStore log;
  log.begin(f);
  log.startSession(makeHeader());

  std::vector<int16_t> lote;
  fillSamples(lote, 19, 0);  // 19 muestras = un lote BLE lleno
  for (int i = 0; i < 200; ++i) {
    if (!log.writeRaw(lote.data(), 19)) break;
  }
  log.endSession();

  check(f.cruces_de_pagina == 0,
        "alguna escritura cruzo el limite de pagina de la NOR");
  check(f.violaciones_nor == 0, "violacion de NOR en la escritura larga");

  SessionHeader h;
  log.readHeader(0, h);
  check(h.sample_count == 19 * 200, "se perdieron muestras en el camino");

  // Verificar el contenido en un punto arbitrario, no solo al principio.
  uint8_t buf[24];
  const uint32_t off = 19 * 12 * 137;  // arranque del lote 137
  check(log.readSamples(0, off, buf, sizeof(buf)) == sizeof(buf),
        "no pude leer del medio de la sesion");
  check(memcmp(buf, lote.data(), sizeof(buf)) == 0,
        "los datos del medio de la sesion no coinciden");
}

void test_volcar_imagen() {
  // Escribe una imagen de flash a disco para que tools/dump_log.py la lea.
  // Cierra el circuito completo: si el formato que escribe el firmware y el
  // que parsea Python se desincronizan, el dataset entero sale corrupto y no
  // hay forma de darse cuenta mirando los numeros.
  FakeFlash f(64 * 1024);
  LogStore log;
  log.begin(f);

  for (int i = 0; i < 2; ++i) {
    SessionHeader h = makeHeader((uint8_t)(i + 1), 70.0f + i * 15);
    log.startSession(h);
    std::vector<int16_t> m;
    fillSamples(m, (uint16_t)(120 + i * 60), (int16_t)(i * 500));
    log.writeRaw(m.data(), (uint16_t)(120 + i * 60));
    log.endSession();
  }

  FILE *out = fopen("build/flash_image.bin", "wb");
  if (out) {
    fwrite(f.mem.data(), 1, f.mem.size(), out);
    fclose(out);
    printf("  (imagen de flash en build/flash_image.bin: 2 sesiones)\n");
  } else {
    check(false, "no pude escribir build/flash_image.bin");
  }
}

void test_presupuesto_real() {
  // Cuentas del chip que lleva la XIAO: 2 MB.
  const uint32_t kFlash = 2 * 1024 * 1024;
  const uint32_t kBytesPorSeg = 208 * 12;
  const uint32_t segundos = kFlash / kBytesPorSeg;
  check(segundos > 700 && segundos < 900,
        "el presupuesto de grabacion cambio respecto de lo documentado");
  printf("  (2 MB a 208 Hz = %u s continuos = %u series de 45 s)\n", segundos,
         segundos / 45);
}

}  // namespace

int main() {
  printf("LogStore contra flash NOR simulada\n");

  test_vacio();
  test_sesion_completa();
  test_muchas_sesiones();
  test_sesion_abierta();
  test_se_llena();
  test_borrado_por_pasos();
  test_escritura_larga_alineacion();
  test_volcar_imagen();
  test_presupuesto_real();

  if (fallas == 0) {
    printf("OK: 9 tests, sin fallas\n");
    return 0;
  }
  printf("%d fallas\n", fallas);
  return 1;
}
