// Volcado del log interno, contra una flash falsa y un stack BLE falso.
//
// Esto existe porque la logica del volcado vivia en main.cpp, que el build de
// PC no compila: quedaba sin una sola prueba justo la parte con los casos que
// arruinan un dataset en silencio — una sesion que quedo abierta, la cola de
// notificaciones llena, la flash que deja de responder en la mitad.

#include "app/log_dumper.h"

#include <cstdio>
#include <cstring>
#include <vector>

#include "ble/ble_stack.h"
#include "ble/vbt_service.h"
#include "storage/log_store.h"

using namespace vbt;
using namespace vbt::app;
using vbt::ble::Chr;
using vbt::ble::IBleStack;
using vbt::ble::VbtService;

namespace {

int fallas = 0;
const char *caso = "";

void check(bool cond, const char *msg) {
  if (!cond) {
    printf("  FALLA  [%s] %s\n", caso, msg);
    fallas++;
  }
}

// --- Flash falsa ----------------------------------------------------------

class FakeFlash : public IFlash {
 public:
  std::vector<uint8_t> mem;
  uint32_t sector_size, page_size;
  // A partir de esta direccion, read() falla. Sirve para simular que el chip
  // deja de responder en la mitad de un volcado.
  uint32_t romper_desde = 0xFFFFFFFFu;

  explicit FakeFlash(uint32_t total, uint32_t sector = 4096, uint32_t page = 256)
      : mem(total, 0xFF), sector_size(sector), page_size(page) {}

  uint32_t size() const override { return (uint32_t)mem.size(); }
  uint32_t sectorSize() const override { return sector_size; }
  uint32_t pageSize() const override { return page_size; }

  bool read(uint32_t addr, uint8_t *buf, uint32_t len) override {
    if (addr + len > mem.size()) return false;
    if (addr >= romper_desde) return false;
    memcpy(buf, mem.data() + addr, len);
    return true;
  }

  bool writePage(uint32_t addr, const uint8_t *buf, uint32_t len) override {
    if (addr + len > mem.size()) return false;
    if (len > page_size) return false;
    if ((addr % page_size) + len > page_size) return false;
    for (uint32_t i = 0; i < len; ++i) mem[addr + i] &= buf[i];
    return true;
  }

  bool eraseSector(uint32_t addr) override {
    if (addr % sector_size != 0) return false;
    if (addr + sector_size > mem.size()) return false;
    memset(mem.data() + addr, 0xFF, sector_size);
    return true;
  }

  bool powerDown() override { return true; }
  bool powerUp() override { return true; }
};

// --- Stack BLE falso ------------------------------------------------------

class FakeStack : public IBleStack {
 public:
  struct Notif {
    Chr chr;
    std::vector<uint8_t> data;
  };
  std::vector<Notif> notifs;
  uint16_t mtu_ = 247;
  // Cuantas notificaciones mas acepta antes de decir que la cola esta llena.
  // -1 = ilimitado.
  int acepta = -1;

  bool notify(Chr c, const uint8_t *d, uint16_t n) override {
    if (acepta == 0) return false;
    if (acepta > 0) acepta--;
    notifs.push_back({c, std::vector<uint8_t>(d, d + n)});
    return true;
  }
  bool setValue(Chr, const uint8_t *, uint16_t) override { return true; }
  uint16_t mtu() const override { return mtu_; }
  bool isConnected() const override { return true; }
  void startAdvertising() override {}
  void stopAdvertising() override {}

  std::vector<Notif> deLogDump() const {
    std::vector<Notif> out;
    for (const auto &n : notifs) {
      if (n.chr == Chr::kLogDump) out.push_back(n);
    }
    return out;
  }
};

// --- Ayudantes ------------------------------------------------------------

SessionHeader header(uint8_t ejercicio, float kg) {
  SessionHeader h{};
  memcpy(h.magic, "VBT1", 4);
  h.format_version = 1;
  h.odr_hz = 208;
  h.accel_fs_g = 8;
  h.gyro_fs_dps = 1000;
  h.exercise_id = ejercicio;
  h.t0_unix = 1789000000u;
  h.load_kg_x10 = (uint16_t)(kg * 10);
  return h;
}

struct Fixture {
  FakeFlash flash{256 * 1024};
  FakeStack stack;
  LogStore log;
  algo::Config algo_cfg;
  app::Config app_cfg;
  ble::SensorTuning tuning;
  VbtService svc;
  LogDumper dumper;

  Fixture() {
    log.begin(flash);
    svc.begin(stack, algo_cfg, app_cfg, tuning);
    dumper.begin(log, svc);
  }

  // Graba una sesion cerrada de n muestras. Cada muestra lleva su indice en
  // los seis ejes, para poder verificar que llegan en orden y sin agujeros.
  void grabar(uint16_t n, uint8_t ejercicio = 1, float kg = 80.0f) {
    log.startSession(header(ejercicio, kg));
    std::vector<int16_t> m;
    for (uint16_t i = 0; i < n; ++i) {
      for (int e = 0; e < 6; ++e) m.push_back((int16_t)i);
    }
    log.writeRaw(m.data(), n);
    log.endSession();
  }

  // Corre el volcado hasta que termina, con tope por si no converge.
  int correr(int tope = 100000) {
    int vueltas = 0;
    while (dumper.paso(true) && vueltas < tope) vueltas++;
    return vueltas;
  }
};

// Reconstruye el archivo desde las notificaciones, igual que hace la app.
struct Reconstruido {
  bool tiene_header = false;
  bool tiene_fin = false;
  uint32_t total_declarado = 0;
  std::vector<uint8_t> header32;
  std::vector<int16_t> muestras;
  int saltos_de_seq = 0;
};

Reconstruido reconstruir(const std::vector<FakeStack::Notif> &notifs) {
  Reconstruido r;
  const size_t hdr = sizeof(vbt_batch_header_t);
  int esperado_seq = -1;

  for (const auto &n : notifs) {
    vbt_batch_header_t h{};
    memcpy(&h, n.data.data(), hdr);

    if (esperado_seq >= 0 && h.seq != (uint16_t)esperado_seq) r.saltos_de_seq++;
    esperado_seq = h.seq + 1;

    if (h.count == VBT_BATCH_SESSION_HDR) {
      r.tiene_header = true;
      r.header32.assign(n.data.begin() + hdr, n.data.end());
    } else if (h.count == VBT_BATCH_END) {
      r.tiene_fin = true;
      r.total_declarado = h.t0_us;
    } else {
      const int16_t *m = (const int16_t *)(n.data.data() + hdr);
      for (uint32_t i = 0; i < h.count * 6u; ++i) r.muestras.push_back(m[i]);
    }
  }
  return r;
}

// --- Casos ----------------------------------------------------------------

void test_volcado_completo() {
  caso = "volcado completo";
  Fixture f;
  f.grabar(500, 2, 102.5f);

  check(f.dumper.empezar(0) == VBT_ERR_NONE, "el volcado tendria que arrancar");
  f.correr();
  check(!f.dumper.activo(), "al terminar no tendria que quedar activo");

  const Reconstruido r = reconstruir(f.stack.deLogDump());
  check(r.tiene_header, "falta el header de la sesion");
  check(r.tiene_fin, "falta la marca de fin");
  check(r.saltos_de_seq == 0, "hubo saltos en la numeracion de lotes");
  check(r.total_declarado == 500, "el total declarado no es 500");
  check(r.muestras.size() == 500u * 6, "no llegaron las 500 muestras");

  // El header que llega ES el header del archivo .vbt: la app copia los bytes
  // y ya tiene un archivo valido. Si esto se rompe, el archivo sale mal sin
  // que nada de por medio se queje.
  check(r.header32.size() == 32, "el header tiene que ser de 32 bytes");
  check(memcmp(r.header32.data(), "VBT1", 4) == 0, "falta el magic VBT1");
  SessionHeader h{};
  memcpy(&h, r.header32.data(), 32);
  check(h.sample_count == 500, "el header no declara 500 muestras");
  check(h.exercise_id == 2, "el ejercicio no sobrevivio");
  check(h.load_kg_x10 == 1025, "la carga no sobrevivio");
  check(h.odr_hz == 208, "el ODR no sobrevivio");

  // Y en ORDEN: cada muestra lleva su indice. Un volcado que entrega las
  // muestras mezcladas produce un archivo que parece bien y mide cualquier
  // cosa.
  bool en_orden = true;
  for (uint32_t i = 0; i < 500; ++i) {
    if (r.muestras[i * 6] != (int16_t)i) { en_orden = false; break; }
  }
  check(en_orden, "las muestras no llegaron en orden");
}

void test_sesion_abierta() {
  caso = "sesion abierta";
  // Se corto la energia en medio de una grabacion: sample_count queda en
  // 0xFFFFFFFF. Volcarla mandaria basura hasta el final de la flash y el
  // archivo parecería valido.
  Fixture f;
  f.log.startSession(header(1, 60.0f));
  std::vector<int16_t> m(19 * 6, 7);
  f.log.writeRaw(m.data(), 19);
  // sin endSession()

  check(f.dumper.empezar(0) != VBT_ERR_NONE,
        "una sesion abierta tiene que rechazarse");
  check(!f.dumper.activo(), "y no tiene que quedar volcando");
  check(f.stack.deLogDump().empty(), "no tendria que haber mandado nada");
}

void test_indice_invalido() {
  caso = "indice invalido";
  Fixture f;
  f.grabar(50);
  check(f.dumper.empezar(7) == VBT_ERR_BAD_PARAM,
        "una sesion que no existe tiene que rechazarse");
  check(f.dumper.empezar(0) == VBT_ERR_NONE, "y la que si existe, no");
}

void test_grabando_no_vuelca() {
  caso = "grabando";
  // Leer y escribir la misma flash a la vez pelea por el bus y puede devolver
  // un sector a medio escribir.
  Fixture f;
  f.grabar(50);
  f.log.startSession(header(1, 60.0f));
  check(f.dumper.empezar(0) == VBT_ERR_QSPI,
        "grabando no se puede volcar");
}

void test_cola_llena() {
  caso = "cola llena";
  // Si la cola de notificaciones esta llena, el lote no sale. Avanzar el
  // offset igual perderia muestras EN SILENCIO, que es el peor final posible
  // para un dataset: el archivo queda corto y nada lo dice.
  Fixture f;
  f.grabar(200);

  f.stack.acepta = 1;                  // solo entra el header
  check(f.dumper.empezar(0) == VBT_ERR_NONE, "arranca");

  for (int i = 0; i < 20; ++i) f.dumper.paso(true);
  check(f.dumper.activo(), "con la cola llena tiene que seguir esperando");
  check(f.dumper.enviadas() == 0, "no tendria que haber contado muestras");

  f.stack.acepta = -1;                 // se destapa
  f.correr();

  const Reconstruido r = reconstruir(f.stack.deLogDump());
  check(r.muestras.size() == 200u * 6,
        "al destaparse tienen que llegar las 200 muestras, sin perder ninguna");
  check(r.total_declarado == 200, "el total declarado tiene que ser 200");
}

void test_flash_rota_a_la_mitad() {
  caso = "flash rota";
  // El chip deja de responder en el medio. Cerrar el volcado como si hubiera
  // terminado bien entregaria un archivo truncado que se presenta como
  // completo, y eso envenena el dataset sin dejar rastro.
  Fixture f;
  f.grabar(400);
  check(f.dumper.empezar(0) == VBT_ERR_NONE, "arranca");

  /* 400 muestras x 12 B = 4800 bytes, que arrancan despues del header de 32.
     Romper en 2000 cae en el medio de verdad; mas alla de 4832 el volcado
     termina antes de tocar la zona rota y el test pasaria sin probar nada. */
  f.flash.romper_desde = 2000;
  f.correr();

  check(!f.dumper.activo(), "tiene que cortar");
  check(f.dumper.error() == VBT_ERR_QSPI, "y avisar del error de flash");

  const Reconstruido r = reconstruir(f.stack.deLogDump());
  check(!r.tiene_fin,
        "no puede mandar la marca de fin: diria que termino bien");
}

void test_desconexion() {
  caso = "desconexion";
  Fixture f;
  f.grabar(400);
  f.dumper.empezar(0);
  f.dumper.paso(true);

  check(!f.dumper.paso(false), "sin conexion tiene que parar");
  check(!f.dumper.activo(), "y soltar el volcado");
  // Seguir leyendo la flash para mandar a nadie solo gasta bateria.
  const size_t antes = f.stack.deLogDump().size();
  f.dumper.paso(false);
  check(f.stack.deLogDump().size() == antes, "no tendria que mandar mas nada");
}

void test_mtu_chico() {
  caso = "mtu chico";
  // Con el MTU por defecto (23) no entran los 8 + 32 bytes del header. Mandar
  // igual haria que la notificacion se descarte entera y el volcado no
  // anduviera nunca, sin ningun mensaje.
  Fixture f;
  f.grabar(100);
  f.stack.mtu_ = 23;
  check(f.dumper.empezar(0) == VBT_ERR_MTU, "tiene que avisar del MTU");
  check(!f.dumper.activo(), "y no arrancar");
}

void test_indice_de_sesiones() {
  caso = "indice de sesiones";
  Fixture f;
  f.grabar(50, 1, 60.0f);
  f.grabar(80, 3, 140.0f);
  f.grabar(30, 2, 100.0f);

  f.dumper.empezarIndice();
  f.correr();

  const auto notifs = f.stack.deLogDump();
  const size_t hdr = sizeof(vbt_batch_header_t);
  int headers = 0;
  bool fin = false;
  uint32_t declarado = 0;
  std::vector<uint8_t> ejercicios;

  for (const auto &n : notifs) {
    vbt_batch_header_t h{};
    memcpy(&h, n.data.data(), hdr);
    if (h.count == VBT_BATCH_SESSION_HDR) {
      headers++;
      SessionHeader s{};
      memcpy(&s, n.data.data() + hdr, 32);
      ejercicios.push_back(s.exercise_id);
    } else if (h.count == VBT_BATCH_END) {
      fin = true;
      declarado = h.t0_us;
    } else {
      check(false, "el indice no tendria que mandar muestras");
    }
  }

  check(headers == 3, "tendrian que llegar los 3 headers");
  check(fin, "falta la marca de fin");
  check(declarado == 3, "el fin tendria que declarar 3 sesiones");
  check(ejercicios.size() == 3 && ejercicios[0] == 1 && ejercicios[1] == 3 &&
            ejercicios[2] == 2,
        "los ejercicios no llegaron en orden");
}

void test_sesion_vacia() {
  caso = "sesion vacia";
  // Una sesion cerrada sin muestras: se arma el archivo con header y nada mas.
  // Tiene que cerrar igual, no quedarse esperando.
  Fixture f;
  f.log.startSession(header(1, 60.0f));
  f.log.endSession();

  check(f.dumper.empezar(0) == VBT_ERR_NONE, "tendria que aceptarse");
  f.correr();
  check(!f.dumper.activo(), "y terminar");

  const Reconstruido r = reconstruir(f.stack.deLogDump());
  check(r.tiene_header && r.tiene_fin, "header y fin");
  check(r.muestras.empty(), "sin muestras");
  check(r.total_declarado == 0, "cero muestras declaradas");
}

}  // namespace

int main() {
  printf("Volcado del log interno\n");

  test_volcado_completo();
  test_sesion_abierta();
  test_indice_invalido();
  test_grabando_no_vuelca();
  test_cola_llena();
  test_flash_rota_a_la_mitad();
  test_desconexion();
  test_mtu_chico();
  test_indice_de_sesiones();
  test_sesion_vacia();

  if (fallas == 0) {
    printf("OK: 10 tests, sin fallas\n");
    return 0;
  }
  printf("%d fallas\n", fallas);
  return 1;
}
