#include "drivers/lsm6ds3tr.h"

namespace vbt {
namespace {

// --- CTRL3_C ---
constexpr uint8_t kCtrl3SwReset = 0x01;
constexpr uint8_t kCtrl3IfInc = 0x04;   // auto-incremento de direccion: sin
                                        // esto las lecturas de rafaga leen
                                        // siempre el mismo registro
constexpr uint8_t kCtrl3Bdu = 0x40;     // block data update: evita mezclar el
                                        // byte alto de una muestra con el bajo
                                        // de la siguiente

// --- FIFO_CTRL5 ---
constexpr uint8_t kFifoModeBypass = 0x00;
constexpr uint8_t kFifoModeContinuous = 0x06;

// --- INT1_CTRL ---
constexpr uint8_t kInt1Fth = 0x08;  // FIFO threshold

// --- TAP_CFG ---
constexpr uint8_t kTapCfgIntEnable = 0x80;
constexpr uint8_t kTapCfgSlopeFds = 0x10;  // filtro de pendiente, lo que usa
                                           // el wake-on-motion
constexpr uint8_t kTapCfgTapZ = 0x02;
constexpr uint8_t kTapCfgTapY = 0x04;
constexpr uint8_t kTapCfgTapX = 0x08;
constexpr uint8_t kTapCfgLir = 0x01;  // latched interrupt

// --- WAKE_UP_THS ---
constexpr uint8_t kWakeThsDoubleTap = 0x80;  // 1 = solo double, 0 = single

// --- MD1_CFG (que rutea a INT1) ---
constexpr uint8_t kMd1DoubleTap = 0x08;
constexpr uint8_t kMd1WakeUp = 0x20;

// --- TAP_SRC / WAKE_UP_SRC ---
constexpr uint8_t kTapSrcDoubleTap = 0x10;
constexpr uint8_t kWakeSrcWakeUpIa = 0x08;

// --- FIFO_STATUS2 ---
constexpr uint8_t kFifoStatus2Over = 0x40;

// El FIFO cuenta en palabras de 16 bits. Una muestra completa (giro + accel)
// son 6 ejes = 6 palabras.
constexpr uint16_t kWordsPerSample = 6;

}  // namespace

bool Lsm6ds3tr::writeReg(uint8_t reg, uint8_t value) {
  return bus_.writeReg(addr_, reg, value);
}

bool Lsm6ds3tr::readReg(uint8_t reg, uint8_t *value) {
  return bus_.readReg(addr_, reg, value);
}

ImuStatus Lsm6ds3tr::begin(const ImuConfig &cfg) {
  cfg_ = cfg;
  streaming_ = false;

  // El IMU necesita un momento despues de que se le da alimentacion.
  bus_.delayMs(20);

  if (!readReg(REG_WHO_AM_I, &who_am_i_)) {
    status_ = ImuStatus::kNoAck;
    return status_;
  }
  if (who_am_i_ != kLsm6WhoAmIExpected) {
    // Si da 0x69 es un LSM6DS3 comun, no el TR-C. Y si da 0x00 o 0xFF,
    // lo mas probable es que el pin de alimentacion del IMU siga en bajo.
    status_ = ImuStatus::kBadWhoAmI;
    return status_;
  }

  if (!writeReg(REG_CTRL3_C, kCtrl3SwReset)) {
    status_ = ImuStatus::kNoAck;
    return status_;
  }
  bus_.delayMs(20);

  writeReg(REG_CTRL3_C, kCtrl3Bdu | kCtrl3IfInc);

  // Arranca con las dos ramas apagadas. startStreaming() las prende.
  writeReg(REG_CTRL1_XL, 0x00);
  writeReg(REG_CTRL2_G, 0x00);

  // FIFO en bypass hasta que se pida streaming: asi no acumula basura
  // durante la configuracion.
  writeReg(REG_FIFO_CTRL5, kFifoModeBypass);

  // Todas las funciones de interrupcion desarmadas.
  writeReg(REG_TAP_CFG, 0x00);
  writeReg(REG_MD1_CFG, 0x00);
  writeReg(REG_MD2_CFG, 0x00);
  writeReg(REG_INT1_CTRL, 0x00);

  status_ = ImuStatus::kOk;
  return status_;
}

bool Lsm6ds3tr::configureFifo(uint16_t watermark_samples) {
  const uint16_t words = watermark_samples * kWordsPerSample;

  // Watermark de 12 bits, repartido entre FIFO_CTRL1 y los 4 bits bajos
  // de FIFO_CTRL2.
  if (!writeReg(REG_FIFO_CTRL1, (uint8_t)(words & 0xFF))) return false;
  if (!writeReg(REG_FIFO_CTRL2, (uint8_t)((words >> 8) & 0x0F))) return false;

  // Sin decimacion en ninguna de las dos ramas: queremos todas las muestras.
  if (!writeReg(REG_FIFO_CTRL3, 0x09)) return false;
  if (!writeReg(REG_FIFO_CTRL4, 0x00)) return false;

  // ODR del FIFO igual al de los sensores, modo continuo. En continuo, si
  // nadie lee, el FIFO descarta lo viejo y sigue: preferimos perder muestras
  // antiguas a frenar la adquisicion.
  const uint8_t fifo_odr = (uint8_t)cfg_.odr;
  return writeReg(REG_FIFO_CTRL5,
                  (uint8_t)((fifo_odr << 3) | kFifoModeContinuous));
}

bool Lsm6ds3tr::startStreaming() {
  const uint8_t odr = (uint8_t)cfg_.odr;

  // CTRL1_XL: ODR[7:4] | FS[3:2]
  if (!writeReg(REG_CTRL1_XL,
                (uint8_t)((odr << 4) | ((uint8_t)cfg_.accel_fs << 2)))) {
    status_ = ImuStatus::kNoAck;
    return false;
  }
  // CTRL2_G: ODR[7:4] | FS[3:2]
  if (!writeReg(REG_CTRL2_G,
                (uint8_t)((odr << 4) | ((uint8_t)cfg_.gyro_fs << 2)))) {
    status_ = ImuStatus::kNoAck;
    return false;
  }

  if (!configureFifo(cfg_.fifo_watermark_samples)) return false;

  // Interrupcion por watermark en INT1: el micro duerme entre lotes en vez
  // de pollear el bus.
  if (!writeReg(REG_INT1_CTRL, kInt1Fth)) return false;

  streaming_ = true;
  status_ = ImuStatus::kOk;
  return true;
}

bool Lsm6ds3tr::stopStreaming() {
  streaming_ = false;
  writeReg(REG_INT1_CTRL, 0x00);
  writeReg(REG_FIFO_CTRL5, kFifoModeBypass);
  writeReg(REG_CTRL1_XL, 0x00);
  writeReg(REG_CTRL2_G, 0x00);
  return true;
}

uint16_t Lsm6ds3tr::fifoLevelSamples() {
  uint8_t s1 = 0, s2 = 0;
  if (!readReg(REG_FIFO_STATUS1, &s1)) return 0;
  if (!readReg(REG_FIFO_STATUS2, &s2)) return 0;

  if (s2 & kFifoStatus2Over) status_ = ImuStatus::kFifoOverrun;

  const uint16_t words = (uint16_t)(((uint16_t)(s2 & 0x0F) << 8) | s1);
  return (uint16_t)(words / kWordsPerSample);
}

uint16_t Lsm6ds3tr::readFifo(ImuSample *out, uint16_t max_samples) {
  if (out == nullptr || max_samples == 0) return 0;

  uint16_t available = fifoLevelSamples();
  if (available == 0) return 0;
  if (available > max_samples) available = max_samples;

  for (uint16_t i = 0; i < available; ++i) {
    uint8_t raw[kWordsPerSample * 2];
    if (!bus_.read(addr_, REG_FIFO_DATA_OUT_L, raw, sizeof(raw))) {
      status_ = ImuStatus::kNoAck;
      return i;
    }

    // El FIFO entrega primero el set del giroscopio y despues el del
    // acelerometro. Little-endian: primero el byte bajo.
    auto word = [&raw](int idx) -> int16_t {
      return (int16_t)((uint16_t)raw[idx * 2] |
                       ((uint16_t)raw[idx * 2 + 1] << 8));
    };

    out[i].gx = word(0);
    out[i].gy = word(1);
    out[i].gz = word(2);
    out[i].ax = word(3);
    out[i].ay = word(4);
    out[i].az = word(5);
  }

  return available;
}

bool Lsm6ds3tr::enableDoubleTap(const TapConfig &cfg) {
  // El double-tap por hardware necesita el acelerometro a 416 Hz como minimo.
  // Consume ~250-300 uA, asi que esto se arma en rafagas cortas, no de forma
  // permanente: ver la maquina de estados en docs/PLAN.md.
  if (!writeReg(REG_CTRL1_XL,
                (uint8_t)(((uint8_t)Odr::k416 << 4) |
                          ((uint8_t)cfg_.accel_fs << 2)))) {
    status_ = ImuStatus::kNoAck;
    return false;
  }

  // Deteccion en los tres ejes: el usuario no siempre golpea perpendicular.
  writeReg(REG_TAP_CFG, (uint8_t)(kTapCfgIntEnable | kTapCfgTapX |
                                  kTapCfgTapY | kTapCfgTapZ | kTapCfgLir));

  writeReg(REG_TAP_THS_6D, (uint8_t)(cfg.threshold & 0x1F));

  // INT_DUR2: DUR[7:4] | QUIET[3:2] | SHOCK[1:0]
  writeReg(REG_INT_DUR2,
           (uint8_t)(((cfg.duration & 0x0F) << 4) | ((cfg.quiet & 0x03) << 2) |
                     (cfg.shock & 0x03)));

  // Bit 7 en alto = solo double tap. Sin esto, un golpe suelto ya dispara,
  // y el bolsillo genera golpes sueltos todo el tiempo.
  uint8_t wake_ths = 0;
  readReg(REG_WAKE_UP_THS, &wake_ths);
  writeReg(REG_WAKE_UP_THS, (uint8_t)(wake_ths | kWakeThsDoubleTap));

  uint8_t md1 = 0;
  readReg(REG_MD1_CFG, &md1);
  return writeReg(REG_MD1_CFG, (uint8_t)(md1 | kMd1DoubleTap));
}

bool Lsm6ds3tr::disableDoubleTap() {
  uint8_t md1 = 0;
  readReg(REG_MD1_CFG, &md1);
  writeReg(REG_MD1_CFG, (uint8_t)(md1 & ~kMd1DoubleTap));

  uint8_t tap_cfg = 0;
  readReg(REG_TAP_CFG, &tap_cfg);
  return writeReg(REG_TAP_CFG,
                  (uint8_t)(tap_cfg & ~(kTapCfgTapX | kTapCfgTapY | kTapCfgTapZ)));
}

bool Lsm6ds3tr::tapOccurred() {
  uint8_t src = 0;
  if (!readReg(REG_TAP_SRC, &src)) return false;  // la lectura la limpia
  return (src & kTapSrcDoubleTap) != 0;
}

bool Lsm6ds3tr::enableWakeOnMotion(const WakeConfig &cfg) {
  // 26 Hz en bajo consumo: alcanza para notar que la barra se movio y cuesta
  // ~25 uA en vez de los ~300 uA que pide el detector de tap.
  if (!writeReg(REG_CTRL1_XL,
                (uint8_t)(((uint8_t)Odr::k26 << 4) |
                          ((uint8_t)cfg_.accel_fs << 2)))) {
    status_ = ImuStatus::kNoAck;
    return false;
  }
  // Giroscopio apagado: en reposo no aporta nada y es lo que mas consume.
  writeReg(REG_CTRL2_G, 0x00);

  // SLOPE_FDS activa el filtro de pendiente, que es contra lo que compara
  // el umbral de wake-up.
  writeReg(REG_TAP_CFG, (uint8_t)(kTapCfgIntEnable | kTapCfgSlopeFds));

  writeReg(REG_WAKE_UP_THS, (uint8_t)(cfg.threshold & 0x3F));
  writeReg(REG_WAKE_UP_DUR, (uint8_t)((cfg.duration & 0x03) << 5));

  uint8_t md1 = 0;
  readReg(REG_MD1_CFG, &md1);
  return writeReg(REG_MD1_CFG, (uint8_t)(md1 | kMd1WakeUp));
}

bool Lsm6ds3tr::disableWakeOnMotion() {
  uint8_t md1 = 0;
  readReg(REG_MD1_CFG, &md1);
  return writeReg(REG_MD1_CFG, (uint8_t)(md1 & ~kMd1WakeUp));
}

bool Lsm6ds3tr::motionOccurred() {
  uint8_t src = 0;
  if (!readReg(REG_WAKE_UP_SRC, &src)) return false;
  return (src & kWakeSrcWakeUpIa) != 0;
}

bool Lsm6ds3tr::powerDown() {
  streaming_ = false;
  writeReg(REG_INT1_CTRL, 0x00);
  writeReg(REG_MD1_CFG, 0x00);
  writeReg(REG_TAP_CFG, 0x00);
  writeReg(REG_FIFO_CTRL5, kFifoModeBypass);
  writeReg(REG_CTRL2_G, 0x00);
  return writeReg(REG_CTRL1_XL, 0x00);
}

float Lsm6ds3tr::accelLsbMg(AccelFs fs) {
  switch (fs) {
    case AccelFs::k2g:  return 0.061f;
    case AccelFs::k4g:  return 0.122f;
    case AccelFs::k8g:  return 0.244f;
    case AccelFs::k16g: return 0.488f;
  }
  return 0.244f;
}

float Lsm6ds3tr::gyroLsbMdps(GyroFs fs) {
  switch (fs) {
    case GyroFs::k250:  return 8.75f;
    case GyroFs::k500:  return 17.50f;
    case GyroFs::k1000: return 35.0f;
    case GyroFs::k2000: return 70.0f;
  }
  return 35.0f;
}

uint16_t Lsm6ds3tr::odrHz(Odr odr) {
  switch (odr) {
    case Odr::kOff:  return 0;
    case Odr::k12_5: return 12;
    case Odr::k26:   return 26;
    case Odr::k52:   return 52;
    case Odr::k104:  return 104;
    case Odr::k208:  return 208;
    case Odr::k416:  return 416;
    case Odr::k833:  return 833;
  }
  return 0;
}

bool Lsm6ds3tr::isSaturated(const ImuSample &s) {
  constexpr int16_t kMax = 32767;
  constexpr int16_t kMin = -32768;
  return s.ax >= kMax || s.ay >= kMax || s.az >= kMax || s.ax <= kMin ||
         s.ay <= kMin || s.az <= kMin;
}

}  // namespace vbt
