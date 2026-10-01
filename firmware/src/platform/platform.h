// Capa de plataforma: conecta las interfaces del firmware con las librerias
// reales de la placa.
//
// Es la UNICA parte del proyecto que no se puede testear en la PC, porque son
// llamadas a librerias que solo existen en el hardware. Por eso es tambien la
// mas corta y la mas tonta posible: cada clase de aca no hace nada mas que
// traducir una llamada. Toda la logica que se pueda probar vive del otro lado
// de la interfaz.
//
// Si algo falla en septiembre, el orden para buscar es: primero board.h (los
// pines), despues este archivo, y recien despues el resto.

#pragma once

#ifdef VBT_TARGET_NRF52

#include <Adafruit_FlashTransport.h>
#include <Arduino.h>
#include <Wire.h>
#include <bluefruit.h>

#include "app/led.h"
#include "ble/ble_stack.h"
#include "ble/protocol.h"  // UUIDs y tamanos de los payloads
#include "drivers/i2c_bus.h"
#include "platform/board.h"
#include "storage/flash.h"

namespace vbt {
namespace platform {

// ---------------------------------------------------------------------------
// I2C
// ---------------------------------------------------------------------------
class ArduinoI2C : public II2CBus {
 public:
  void begin();

  bool write(uint8_t addr, uint8_t reg, const uint8_t *data,
             uint16_t len) override;
  bool read(uint8_t addr, uint8_t reg, uint8_t *data, uint16_t len) override;
  void delayMs(uint32_t ms) override { delay(ms); }
  uint32_t microsSinceBoot() override { return micros(); }
};

// ---------------------------------------------------------------------------
// Flash QSPI
// ---------------------------------------------------------------------------
class QspiFlash : public IFlash {
 public:
  bool begin();

  uint32_t size() const override { return size_; }
  uint32_t sectorSize() const override { return 4096; }
  uint32_t pageSize() const override { return 256; }

  bool read(uint32_t addr, uint8_t *buf, uint32_t len) override;
  bool writePage(uint32_t addr, const uint8_t *buf, uint32_t len) override;
  bool eraseSector(uint32_t addr) override;
  bool powerDown() override;
  bool powerUp() override;

 private:
  bool waitReady(uint32_t timeout_ms = 1000);

  Adafruit_FlashTransport_QSPI transport_;
  uint32_t size_ = 2 * 1024 * 1024;
  bool powered_down_ = false;
};

// ---------------------------------------------------------------------------
// BLE
// ---------------------------------------------------------------------------
class BluefruitStack : public ble::IBleStack {
 public:
  bool begin();

  bool notify(ble::Chr c, const uint8_t *data, uint16_t len) override;
  bool setValue(ble::Chr c, const uint8_t *data, uint16_t len) override;
  bool isConnected() const override { return connected_; }
  uint16_t mtu() const override { return mtu_; }
  void startAdvertising() override;
  void stopAdvertising() override;

  // Los llama Bluefruit desde sus callbacks.
  void onConnectCb(uint16_t handle);
  void onDisconnectCb(uint16_t handle, uint8_t reason);

  bool takeConnectedEvent();
  bool takeDisconnectedEvent();

  // Buffer del ultimo write recibido en Control y Config.
  bool takeControlWrite(uint8_t *out, uint16_t *len);
  bool takeConfigWrite(uint8_t *out, uint16_t *len);

  void stashControlWrite(const uint8_t *data, uint16_t len);
  void stashConfigWrite(const uint8_t *data, uint16_t len);

 private:
  BLECharacteristic *charFor(ble::Chr c);

  BLEService svc_{(const uint8_t[16])VBT_UUID128_BASE(0x00)};
  BLECharacteristic rep_{(const uint8_t[16])VBT_UUID128_BASE(0x01)};
  BLECharacteristic summary_{(const uint8_t[16])VBT_UUID128_BASE(0x02)};
  BLECharacteristic control_{(const uint8_t[16])VBT_UUID128_BASE(0x03)};
  BLECharacteristic config_{(const uint8_t[16])VBT_UUID128_BASE(0x04)};
  BLECharacteristic status_{(const uint8_t[16])VBT_UUID128_BASE(0x05)};
  BLECharacteristic raw_{(const uint8_t[16])VBT_UUID128_BASE(0x06)};
  BLECharacteristic dump_{(const uint8_t[16])VBT_UUID128_BASE(0x07)};
  BLEBas bas_;
  BLEDis dis_;

  volatile bool connected_ = false;
  volatile bool ev_connected_ = false;
  volatile bool ev_disconnected_ = false;
  uint16_t mtu_ = 23;

  uint8_t ctrl_buf_[20];
  volatile uint16_t ctrl_len_ = 0;
  uint8_t cfg_buf_[8];
  volatile uint16_t cfg_len_ = 0;
};

// ---------------------------------------------------------------------------
// LED y bateria
// ---------------------------------------------------------------------------
void initLed();
void writeLed(const app::LedOutput &out);

void initBattery();
uint16_t readBatteryMillivolts();
bool isCharging();

// Duerme hasta el proximo evento manteniendo la RAM y el estado (System ON
// idle, ~2 uA). NO se usa System OFF: consume menos pero resetea el micro, y
// perder el estado obligaria a reconstruirlo en cada despertar.
void sleepUntilEvent();

void enableImuWakeInterrupt(void (*handler)());

}  // namespace platform
}  // namespace vbt

#endif  // VBT_TARGET_NRF52
