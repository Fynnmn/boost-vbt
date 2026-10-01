// Driver del ST LSM6DS3TR-C, el IMU de 6 ejes de la XIAO nRF52840 Sense.
//
// Escrito a nivel de registro contra el datasheet en vez de usar una libreria
// de Arduino, porque ninguna expone las cuatro cosas que son el proyecto:
// FIFO, double-tap por hardware, wake-on-motion y el ruteo de INT1.
//
// OJO: es el LSM6DS3TR-C, no el LSM6DS3 a secas. El WHO_AM_I difiere
// (0x6A contra 0x69) y parte del mapa de registros tambien.

#pragma once

#include <stdint.h>

#include "drivers/i2c_bus.h"

namespace vbt {

// Direccion I2C con SA0 a masa, que es como esta cableado en la XIAO.
constexpr uint8_t kLsm6AddrDefault = 0x6A;
constexpr uint8_t kLsm6WhoAmIExpected = 0x6A;

// -----------------------------------------------------------------------
// Pines de la XIAO nRF52840 Sense
// -----------------------------------------------------------------------
// El IMU esta alimentado por un GPIO dedicado: hay que ponerlo en alto y
// esperar antes de hablarle por I2C. Si no, el bus no responde nada y parece
// que la placa esta quemada. Es el error que cuesta medio dia si no se sabe.
//
// Estos numeros salen del variant.h del board package de Seeed, NO del wiki
// (el wiki no siempre coincide con la revision de placa). Verificarlos el
// dia 1 contra el variant.h real y anotarlos en docs/DECISIONS.md.
constexpr uint8_t kPinImuPower = 1 + 8;   // P1.08
constexpr uint8_t kPinImuInt1 = 0 + 11;   // P0.11

// -----------------------------------------------------------------------
// Registros
// -----------------------------------------------------------------------
enum Lsm6Reg : uint8_t {
  REG_FUNC_CFG_ACCESS = 0x01,
  REG_FIFO_CTRL1      = 0x06,
  REG_FIFO_CTRL2      = 0x07,
  REG_FIFO_CTRL3      = 0x08,
  REG_FIFO_CTRL4      = 0x09,
  REG_FIFO_CTRL5      = 0x0A,
  REG_INT1_CTRL       = 0x0D,
  REG_INT2_CTRL       = 0x0E,
  REG_WHO_AM_I        = 0x0F,
  REG_CTRL1_XL        = 0x10,
  REG_CTRL2_G         = 0x11,
  REG_CTRL3_C         = 0x12,
  REG_CTRL4_C         = 0x13,
  REG_CTRL5_C         = 0x14,
  REG_CTRL6_C         = 0x15,
  REG_CTRL7_G         = 0x16,
  REG_CTRL8_XL        = 0x17,
  REG_CTRL9_XL        = 0x18,
  REG_CTRL10_C        = 0x19,
  REG_WAKE_UP_SRC     = 0x1B,
  REG_TAP_SRC         = 0x1C,
  REG_STATUS_REG      = 0x1E,
  REG_OUTX_L_G        = 0x22,
  REG_OUTX_L_XL       = 0x28,
  REG_FIFO_STATUS1    = 0x3A,
  REG_FIFO_STATUS2    = 0x3B,
  REG_FIFO_DATA_OUT_L = 0x3E,
  REG_TAP_CFG         = 0x58,
  REG_TAP_THS_6D      = 0x59,
  REG_INT_DUR2        = 0x5A,
  REG_WAKE_UP_THS     = 0x5B,
  REG_WAKE_UP_DUR     = 0x5C,
  REG_MD1_CFG         = 0x5E,
  REG_MD2_CFG         = 0x5F,
};

// -----------------------------------------------------------------------
// Configuracion
// -----------------------------------------------------------------------

enum class Odr : uint8_t {
  kOff   = 0x00,
  k12_5  = 0x01,
  k26    = 0x02,
  k52    = 0x03,
  k104   = 0x04,
  k208   = 0x05,  // el que usamos midiendo
  k416   = 0x06,  // minimo para que ande el double-tap por hardware
  k833   = 0x07,
};

enum class AccelFs : uint8_t {
  k2g  = 0x00,
  k16g = 0x01,
  k4g  = 0x02,
  k8g  = 0x03,  // el que usamos: re-rackear la barra pasa 2g facil
};

enum class GyroFs : uint8_t {
  k250  = 0x00,
  k500  = 0x01,
  k1000 = 0x02,  // el que usamos
  k2000 = 0x03,
};

// Los cuatro parametros del double-tap. Los valores definitivos salen de
// probar con la carcasa puesta, no del datasheet.
struct TapConfig {
  uint8_t threshold = 12;  // TAP_THS[4:0], LSB = FS/32. Con +-8g: ~250 mg
  uint8_t shock = 3;       // SHOCK[1:0], duracion maxima de cada golpe
  uint8_t quiet = 3;       // QUIET[1:0], silencio obligatorio tras cada golpe
  uint8_t duration = 7;    // DUR[3:0], ventana maxima entre los dos golpes
};

struct WakeConfig {
  // WK_THS[5:0], LSB = FS_XL / 64. Con +-8g cada cuenta son 125 mg.
  uint8_t threshold = 16;  // ~2 g: caminar y el bolsillo no llegan
  uint8_t duration = 0;    // WAKE_DUR[1:0], en ciclos de ODR
};

struct ImuConfig {
  Odr odr = Odr::k208;
  AccelFs accel_fs = AccelFs::k8g;
  GyroFs gyro_fs = GyroFs::k1000;
  uint16_t fifo_watermark_samples = 19;  // = un lote BLE lleno
};

// Una muestra cruda, tal como sale del FIFO. Sin convertir a propósito:
// convertir en el micro gasta ciclos, pierde precision y esconde la saturacion.
struct ImuSample {
  int16_t ax, ay, az;
  int16_t gx, gy, gz;
};

enum class ImuStatus : uint8_t {
  kOk = 0,
  kNoAck,        // el IMU no contesta: revisar el pin de alimentacion
  kBadWhoAmI,    // contesta pero no es el chip esperado
  kFifoOverrun,  // se leyo tarde y se perdieron muestras
};

// -----------------------------------------------------------------------
// Driver
// -----------------------------------------------------------------------

class Lsm6ds3tr {
 public:
  explicit Lsm6ds3tr(II2CBus &bus, uint8_t addr = kLsm6AddrDefault)
      : bus_(bus), addr_(addr) {}

  // Reset por software, verificacion del WHO_AM_I y configuracion inicial.
  // El pin de alimentacion del IMU tiene que estar en alto ANTES de llamar
  // a esto (lo hace la capa de plataforma, no el driver).
  ImuStatus begin(const ImuConfig &cfg);

  ImuStatus lastStatus() const { return status_; }
  uint8_t whoAmI() const { return who_am_i_; }

  // --- Modo medicion ---------------------------------------------------
  bool startStreaming();
  bool stopStreaming();

  // Lee hasta max_samples del FIFO. Devuelve cuantas saco.
  // Marca overrun en lastStatus() si el FIFO se desbordo: es una senal de
  // que el loop esta llegando tarde, no un error del sensor.
  uint16_t readFifo(ImuSample *out, uint16_t max_samples);

  uint16_t fifoLevelSamples();

  // --- Double tap por hardware ----------------------------------------
  // Arma la deteccion y la rutea a INT1. Requiere ODR >= 416 Hz, que consume
  // ~250-300 uA: por eso no queda armado permanentemente, sino en rafagas de
  // unos segundos despues de que el wake-on-motion despierte al micro.
  bool enableDoubleTap(const TapConfig &cfg);
  bool disableDoubleTap();
  bool tapOccurred();  // lee y limpia TAP_SRC

  // --- Wake-on-motion --------------------------------------------------
  // Deja el IMU a 26 Hz en bajo consumo (~25 uA) vigilando movimiento, y
  // rutea la interrupcion a INT1. Es el modo en el que vive durante el Sleep.
  bool enableWakeOnMotion(const WakeConfig &cfg);
  bool disableWakeOnMotion();
  bool motionOccurred();  // lee y limpia WAKE_UP_SRC

  // Apaga las dos ramas analogicas. Consumo minimo, no despierta por nada.
  bool powerDown();

  // --- Utilidades ------------------------------------------------------
  // Escalas para convertir en la PC. El firmware no las usa para nada mas
  // que reportarlas.
  static float accelLsbMg(AccelFs fs);
  static float gyroLsbMdps(GyroFs fs);
  static uint16_t odrHz(Odr odr);

  // Una muestra saturada trae +-32767 en algun eje. Marcarla importa: un
  // acelerometro saturado da velocidad plausible pero falsa.
  static bool isSaturated(const ImuSample &s);

 private:
  bool writeReg(uint8_t reg, uint8_t value);
  bool readReg(uint8_t reg, uint8_t *value);
  bool configureFifo(uint16_t watermark_samples);

  II2CBus &bus_;
  uint8_t addr_;
  ImuConfig cfg_{};
  ImuStatus status_ = ImuStatus::kOk;
  uint8_t who_am_i_ = 0;
  bool streaming_ = false;
};

}  // namespace vbt
