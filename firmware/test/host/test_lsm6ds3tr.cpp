// Verifica el driver del LSM6DS3TR-C contra un bus I2C falso.
//
// Esto es lo que hace que valga la pena tener la capa II2CBus: se puede
// comprobar que el driver escribe los registros correctos, con los valores
// correctos, en el orden correcto, sin tener la placa. Cuando llegue el
// hardware en septiembre, los errores que queden van a ser de cableado o de
// timing, no de bits mal calculados.

#include "drivers/lsm6ds3tr.h"

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

void checkReg(uint8_t got, uint8_t want, const char *msg) {
  if (got != want) {
    printf("  FALLA  %s: escribio 0x%02X, esperaba 0x%02X\n", msg, got, want);
    fallas++;
  }
}

// Bus falso: guarda un banco de registros, anota cada escritura, y puede
// simular que el IMU no contesta.
class FakeBus : public II2CBus {
 public:
  uint8_t regs[256] = {0};
  std::vector<std::pair<uint8_t, uint8_t>> writes;
  bool nack = false;
  uint32_t delay_total_ms = 0;

  // Cola de bytes que devuelve al leer FIFO_DATA_OUT_L.
  std::vector<uint8_t> fifo_bytes;
  size_t fifo_pos = 0;

  FakeBus() { regs[REG_WHO_AM_I] = kLsm6WhoAmIExpected; }

  bool write(uint8_t, uint8_t reg, const uint8_t *data, uint16_t len) override {
    if (nack) return false;
    for (uint16_t i = 0; i < len; ++i) {
      regs[(uint8_t)(reg + i)] = data[i];
      writes.push_back({(uint8_t)(reg + i), data[i]});
    }
    return true;
  }

  bool read(uint8_t, uint8_t reg, uint8_t *data, uint16_t len) override {
    if (nack) return false;
    if (reg == REG_FIFO_DATA_OUT_L) {
      for (uint16_t i = 0; i < len; ++i) {
        data[i] = fifo_pos < fifo_bytes.size() ? fifo_bytes[fifo_pos++] : 0;
      }
      return true;
    }
    for (uint16_t i = 0; i < len; ++i) data[i] = regs[(uint8_t)(reg + i)];
    return true;
  }

  void delayMs(uint32_t ms) override { delay_total_ms += ms; }
  uint32_t microsSinceBoot() override { return 0; }

  // Ultimo valor escrito en un registro, o 0xFF si nunca se escribio.
  uint8_t lastWrite(uint8_t reg) const {
    for (auto it = writes.rbegin(); it != writes.rend(); ++it) {
      if (it->first == reg) return it->second;
    }
    return 0xFF;
  }

  bool wroteReg(uint8_t reg) const {
    for (const auto &w : writes) {
      if (w.first == reg) return true;
    }
    return false;
  }
};

void test_begin_ok() {
  FakeBus bus;
  Lsm6ds3tr imu(bus);
  ImuConfig cfg;

  check(imu.begin(cfg) == ImuStatus::kOk, "begin deberia devolver kOk");
  check(imu.whoAmI() == 0x6A, "WHO_AM_I mal leido");

  // Un reset por software y despues BDU + auto-incremento. Sin IF_INC las
  // lecturas de rafaga del FIFO devolverian siempre el mismo byte.
  checkReg(bus.lastWrite(REG_CTRL3_C), 0x44, "CTRL3_C final (BDU | IF_INC)");
  check(bus.delay_total_ms >= 40, "falto esperar despues del reset");

  // Todo desarmado al terminar begin: nada de interrupciones colgadas.
  checkReg(bus.lastWrite(REG_CTRL1_XL), 0x00, "acelerometro apagado tras begin");
  checkReg(bus.lastWrite(REG_TAP_CFG), 0x00, "TAP_CFG desarmado tras begin");
  checkReg(bus.lastWrite(REG_INT1_CTRL), 0x00, "INT1 desarmado tras begin");
}

void test_begin_wrong_chip() {
  FakeBus bus;
  bus.regs[REG_WHO_AM_I] = 0x69;  // LSM6DS3 comun, no el TR-C
  Lsm6ds3tr imu(bus);

  check(imu.begin(ImuConfig{}) == ImuStatus::kBadWhoAmI,
        "un WHO_AM_I de 0x69 tiene que dar kBadWhoAmI");
  check(!bus.wroteReg(REG_CTRL1_XL),
        "no deberia configurar nada si el chip no es el esperado");
}

void test_begin_no_ack() {
  FakeBus bus;
  bus.nack = true;  // el caso tipico: el pin de alimentacion del IMU en bajo
  Lsm6ds3tr imu(bus);

  check(imu.begin(ImuConfig{}) == ImuStatus::kNoAck,
        "sin ACK tiene que dar kNoAck");
}

void test_streaming_registers() {
  FakeBus bus;
  Lsm6ds3tr imu(bus);
  imu.begin(ImuConfig{});
  bus.writes.clear();

  check(imu.startStreaming(), "startStreaming deberia funcionar");

  // 208 Hz (0x5) en ODR[7:4], +-8g (0x3) en FS[3:2] -> 0x50 | 0x0C = 0x5C
  checkReg(bus.lastWrite(REG_CTRL1_XL), 0x5C, "CTRL1_XL a 208 Hz +-8g");
  // 208 Hz, 1000 dps (0x2) -> 0x50 | 0x08 = 0x58
  checkReg(bus.lastWrite(REG_CTRL2_G), 0x58, "CTRL2_G a 208 Hz 1000 dps");

  // Watermark: 19 muestras x 6 palabras = 114 palabras = 0x72
  checkReg(bus.lastWrite(REG_FIFO_CTRL1), 0x72, "watermark byte bajo");
  checkReg(bus.lastWrite(REG_FIFO_CTRL2), 0x00, "watermark byte alto");
  // Sin decimacion en ninguna rama
  checkReg(bus.lastWrite(REG_FIFO_CTRL3), 0x09, "FIFO sin decimacion");
  // ODR del FIFO 208 Hz (0x5 << 3) | modo continuo (0x6) = 0x2E
  checkReg(bus.lastWrite(REG_FIFO_CTRL5), 0x2E, "FIFO continuo a 208 Hz");
  // Interrupcion por watermark en INT1
  checkReg(bus.lastWrite(REG_INT1_CTRL), 0x08, "INT1 por watermark del FIFO");
}

void test_fifo_read_order() {
  FakeBus bus;
  Lsm6ds3tr imu(bus);
  imu.begin(ImuConfig{});
  imu.startStreaming();

  // Dos muestras en el FIFO: 2 x 6 palabras = 12 palabras.
  bus.regs[REG_FIFO_STATUS1] = 12;
  bus.regs[REG_FIFO_STATUS2] = 0;

  // El FIFO entrega el giroscopio primero y despues el acelerometro,
  // little-endian. Muestra 1: g = (1,2,3), a = (4,5,-6).
  auto push16 = [&bus](int16_t v) {
    bus.fifo_bytes.push_back((uint8_t)(v & 0xFF));
    bus.fifo_bytes.push_back((uint8_t)((v >> 8) & 0xFF));
  };
  push16(1); push16(2); push16(3);
  push16(4); push16(5); push16(-6);
  push16(10); push16(20); push16(30);
  push16(40); push16(50); push16(4096);

  ImuSample out[4];
  uint16_t n = imu.readFifo(out, 4);

  check(n == 2, "deberia leer 2 muestras");
  check(out[0].gx == 1 && out[0].gy == 2 && out[0].gz == 3,
        "giroscopio de la muestra 1 mal parseado");
  check(out[0].ax == 4 && out[0].ay == 5 && out[0].az == -6,
        "acelerometro de la muestra 1 mal parseado (ojo el signo)");
  check(out[1].az == 4096, "acelerometro de la muestra 2 mal parseado");
}

void test_fifo_overrun_flag() {
  FakeBus bus;
  Lsm6ds3tr imu(bus);
  imu.begin(ImuConfig{});

  bus.regs[REG_FIFO_STATUS1] = 6;
  bus.regs[REG_FIFO_STATUS2] = 0x40;  // bit de overrun

  imu.fifoLevelSamples();
  check(imu.lastStatus() == ImuStatus::kFifoOverrun,
        "el overrun del FIFO tiene que quedar registrado");
}

void test_double_tap() {
  FakeBus bus;
  Lsm6ds3tr imu(bus);
  imu.begin(ImuConfig{});
  bus.writes.clear();

  TapConfig tap;
  tap.threshold = 12;
  tap.shock = 3;
  tap.quiet = 3;
  tap.duration = 7;
  check(imu.enableDoubleTap(tap), "enableDoubleTap deberia funcionar");

  // El tap por hardware exige 416 Hz: 0x6 << 4 | +-8g -> 0x6C
  checkReg(bus.lastWrite(REG_CTRL1_XL), 0x6C,
           "el tap necesita el acelerometro a 416 Hz");

  // Los tres ejes habilitados, interrupciones activadas y latched.
  checkReg(bus.lastWrite(REG_TAP_CFG), 0x8F, "TAP_CFG con los 3 ejes y LIR");
  checkReg(bus.lastWrite(REG_TAP_THS_6D), 12, "umbral de tap");

  // INT_DUR2 = DUR[7:4] | QUIET[3:2] | SHOCK[1:0] = 0x70 | 0x0C | 0x03
  checkReg(bus.lastWrite(REG_INT_DUR2), 0x7F, "INT_DUR2 mal armado");

  // Bit 7 de WAKE_UP_THS: solo double tap. Sin esto un golpe suelto dispara,
  // y el bolsillo genera golpes sueltos todo el tiempo.
  check((bus.lastWrite(REG_WAKE_UP_THS) & 0x80) != 0,
        "falto poner SINGLE_DOUBLE_TAP: dispararia con un solo golpe");

  // Ruteado a INT1.
  check((bus.lastWrite(REG_MD1_CFG) & 0x08) != 0,
        "el double tap no quedo ruteado a INT1");

  // TAP_SRC con el bit de double tap.
  bus.regs[REG_TAP_SRC] = 0x10;
  check(imu.tapOccurred(), "no detecto el double tap");
  bus.regs[REG_TAP_SRC] = 0x00;
  check(!imu.tapOccurred(), "detecto un tap que no ocurrio");
}

void test_wake_on_motion() {
  FakeBus bus;
  Lsm6ds3tr imu(bus);
  imu.begin(ImuConfig{});
  bus.writes.clear();

  WakeConfig wake;
  wake.threshold = 16;  // con +-8g cada cuenta son 125 mg -> ~2 g
  check(imu.enableWakeOnMotion(wake), "enableWakeOnMotion deberia funcionar");

  // 26 Hz en bajo consumo: 0x2 << 4 | +-8g -> 0x2C.
  // Este es el modo en el que el sensor pasa la mayor parte de su vida, y la
  // razon por la que el consumo en reposo queda en decenas de uA y no en 300.
  checkReg(bus.lastWrite(REG_CTRL1_XL), 0x2C,
           "el wake-on-motion tiene que dejar el acelerometro a 26 Hz");
  checkReg(bus.lastWrite(REG_CTRL2_G), 0x00,
           "el giroscopio tiene que quedar apagado en reposo");

  // SLOPE_FDS: el umbral compara contra el filtro de pendiente.
  check((bus.lastWrite(REG_TAP_CFG) & 0x10) != 0, "falto SLOPE_FDS");
  checkReg(bus.lastWrite(REG_WAKE_UP_THS), 16, "umbral de wake-up");
  check((bus.lastWrite(REG_MD1_CFG) & 0x20) != 0,
        "el wake-up no quedo ruteado a INT1");

  bus.regs[REG_WAKE_UP_SRC] = 0x08;
  check(imu.motionOccurred(), "no detecto el movimiento");
}

void test_power_down() {
  FakeBus bus;
  Lsm6ds3tr imu(bus);
  imu.begin(ImuConfig{});
  imu.startStreaming();
  bus.writes.clear();

  check(imu.powerDown(), "powerDown deberia funcionar");
  checkReg(bus.lastWrite(REG_CTRL1_XL), 0x00, "acelerometro apagado");
  checkReg(bus.lastWrite(REG_CTRL2_G), 0x00, "giroscopio apagado");
  checkReg(bus.lastWrite(REG_MD1_CFG), 0x00, "interrupciones desarmadas");
}

void test_scales() {
  // Estas escalas son las que usa tools/decode.py para convertir en la PC.
  // Si se desincronizan, los datos quedan mal por un factor constante y no
  // se nota mirando los graficos.
  check(Lsm6ds3tr::accelLsbMg(AccelFs::k8g) == 0.244f, "LSB del acelerometro a +-8g");
  check(Lsm6ds3tr::gyroLsbMdps(GyroFs::k1000) == 35.0f, "LSB del giroscopio a 1000 dps");
  check(Lsm6ds3tr::odrHz(Odr::k208) == 208, "208 Hz");
  check(Lsm6ds3tr::odrHz(Odr::k416) == 416, "416 Hz");

  // 1 g a +-8g tienen que ser ~4098 cuentas.
  const int counts = (int)(1000.0f / Lsm6ds3tr::accelLsbMg(AccelFs::k8g));
  check(counts > 4090 && counts < 4110, "la escala del acelerometro da raro");

  ImuSample sat{};
  sat.az = 32767;
  check(Lsm6ds3tr::isSaturated(sat), "no detecto la saturacion");
  ImuSample ok{};
  ok.az = 4096;
  check(!Lsm6ds3tr::isSaturated(ok), "marco saturacion donde no la hay");
}

}  // namespace

int main() {
  printf("Driver LSM6DS3TR-C contra bus falso\n");

  test_begin_ok();
  test_begin_wrong_chip();
  test_begin_no_ack();
  test_streaming_registers();
  test_fifo_read_order();
  test_fifo_overrun_flag();
  test_double_tap();
  test_wake_on_motion();
  test_power_down();
  test_scales();

  if (fallas == 0) {
    printf("OK: 10 tests, sin fallas\n");
    return 0;
  }
  printf("%d fallas\n", fallas);
  return 1;
}
