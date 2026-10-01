#ifdef VBT_TARGET_NRF52

#include "platform/platform.h"

#include <string.h>

namespace vbt {
namespace platform {
namespace {

// Comandos del chip de flash NOR (compatibles con la mayoria de las SPI NOR).
constexpr uint8_t kCmdWriteEnable = 0x06;
constexpr uint8_t kCmdReadStatus = 0x05;
constexpr uint8_t kCmdPageProgram = 0x02;
constexpr uint8_t kCmdSectorErase = 0x20;
constexpr uint8_t kCmdDeepPowerDown = 0xB9;
constexpr uint8_t kCmdReleasePowerDown = 0xAB;
constexpr uint8_t kStatusBusy = 0x01;

BluefruitStack *g_stack = nullptr;

}  // namespace

// ---------------------------------------------------------------------------
// I2C
// ---------------------------------------------------------------------------

void ArduinoI2C::begin() {
  Wire.begin();
  Wire.setClock(400000);  // 400 kHz: 208 Hz x 12 B son 2,5 kB/s, sobra
}

bool ArduinoI2C::write(uint8_t addr, uint8_t reg, const uint8_t *data,
                       uint16_t len) {
  Wire.beginTransmission(addr);
  Wire.write(reg);
  for (uint16_t i = 0; i < len; ++i) Wire.write(data[i]);
  return Wire.endTransmission() == 0;
}

bool ArduinoI2C::read(uint8_t addr, uint8_t reg, uint8_t *data, uint16_t len) {
  Wire.beginTransmission(addr);
  Wire.write(reg);
  // false = repeated start. Sin esto el bus se libera entre la direccion y la
  // lectura, y otro maestro podria colarse. Aca no hay otro maestro, pero el
  // repeated start es lo que espera el LSM6DS3TR.
  if (Wire.endTransmission(false) != 0) return false;

  const uint8_t got = Wire.requestFrom(addr, (uint8_t)len);
  if (got != len) return false;
  for (uint16_t i = 0; i < len; ++i) data[i] = Wire.read();
  return true;
}

// ---------------------------------------------------------------------------
// Flash QSPI
// ---------------------------------------------------------------------------

bool QspiFlash::begin() {
  transport_.begin();
  powerUp();
  return true;
}

bool QspiFlash::waitReady(uint32_t timeout_ms) {
  const uint32_t hasta = millis() + timeout_ms;
  while (millis() < hasta) {
    uint8_t status = 0;
    transport_.readCommand(kCmdReadStatus, &status, 1);
    if ((status & kStatusBusy) == 0) return true;
    yield();
  }
  return false;
}

bool QspiFlash::read(uint32_t addr, uint8_t *buf, uint32_t len) {
  if (powered_down_) powerUp();
  return transport_.readMemory(addr, buf, len);
}

bool QspiFlash::writePage(uint32_t addr, const uint8_t *buf, uint32_t len) {
  if (powered_down_) powerUp();
  // El chip no acepta una escritura que cruce el limite de pagina: da la
  // vuelta al principio de la MISMA pagina y corrompe datos sin avisar.
  // log_store ya lo respeta; esto es el cinturon de seguridad.
  if ((addr % pageSize()) + len > pageSize()) return false;

  if (!waitReady()) return false;
  transport_.runCommand(kCmdWriteEnable);
  const bool ok = transport_.writeMemory(addr, buf, len);
  if (!ok) return false;
  return waitReady();
}

bool QspiFlash::eraseSector(uint32_t addr) {
  if (powered_down_) powerUp();
  if (addr % sectorSize() != 0) return false;
  if (!waitReady()) return false;
  transport_.runCommand(kCmdWriteEnable);
  transport_.eraseCommand(kCmdSectorErase, addr);
  // Borrar un sector tarda decenas de ms; con 2 MB son casi 25 s en total.
  // Por eso log_store borra de a un sector por llamada.
  return waitReady(2000);
}

bool QspiFlash::powerDown() {
  if (powered_down_) return true;
  // OBLIGATORIO. Sin esto el chip se come ~450 uA en reposo: la diferencia
  // entre un ano de autonomia y tres semanas.
  transport_.runCommand(kCmdDeepPowerDown);
  powered_down_ = true;
  return true;
}

bool QspiFlash::powerUp() {
  if (!powered_down_) return true;
  transport_.runCommand(kCmdReleasePowerDown);
  delayMicroseconds(50);  // tRES1 del datasheet
  powered_down_ = false;
  return true;
}

// ---------------------------------------------------------------------------
// BLE
// ---------------------------------------------------------------------------

namespace {

void connectCb(uint16_t handle) {
  if (g_stack) g_stack->onConnectCb(handle);
}

void disconnectCb(uint16_t handle, uint8_t reason) {
  if (g_stack) g_stack->onDisconnectCb(handle, reason);
}

void controlWriteCb(uint16_t, BLECharacteristic *, uint8_t *data,
                    uint16_t len) {
  if (g_stack) g_stack->stashControlWrite(data, len);
}

void configWriteCb(uint16_t, BLECharacteristic *, uint8_t *data, uint16_t len) {
  if (g_stack) g_stack->stashConfigWrite(data, len);
}

}  // namespace

bool BluefruitStack::begin() {
  g_stack = this;

  Bluefruit.begin();
  Bluefruit.setTxPower(4);

  // Nombre VBT-XXXX con los ultimos digitos del ID unico del chip, para poder
  // distinguir dos sensores en el mismo gimnasio.
  char nombre[16];
  snprintf(nombre, sizeof(nombre), "VBT-%04X",
           (unsigned)(NRF_FICR->DEVICEID[0] & 0xFFFF));
  Bluefruit.setName(nombre);

  Bluefruit.Periph.setConnectCallback(connectCb);
  Bluefruit.Periph.setDisconnectCallback(disconnectCb);

  dis_.setManufacturer("VBT");
  dis_.setModel("VBT-1");
  char fw[8];
  snprintf(fw, sizeof(fw), "%d.%d", VBT_FW_VERSION_MAJOR, VBT_FW_VERSION_MINOR);
  dis_.setSoftwareRev(fw);
  dis_.begin();

  // Battery Service estandar: iOS y Android muestran la bateria del sensor en
  // los ajustes del sistema sin una linea de codigo en la app.
  bas_.begin();

  svc_.begin();  // el servicio va PRIMERO; las characteristics despues

  auto notifyChr = [](BLECharacteristic &c, uint16_t len) {
    c.setProperties(CHR_PROPS_NOTIFY);
    c.setPermission(SECMODE_OPEN, SECMODE_NO_ACCESS);
    c.setFixedLen(len);
    c.begin();
  };

  notifyChr(rep_, sizeof(vbt_rep_result_t));
  notifyChr(summary_, sizeof(vbt_set_summary_t));
  notifyChr(raw_, VBT_BATCH_MAX_PAYLOAD);
  notifyChr(dump_, VBT_BATCH_MAX_PAYLOAD);

  status_.setProperties(CHR_PROPS_NOTIFY | CHR_PROPS_READ);
  status_.setPermission(SECMODE_OPEN, SECMODE_NO_ACCESS);
  status_.setFixedLen(sizeof(vbt_status_t));
  status_.begin();

  control_.setProperties(CHR_PROPS_WRITE);
  control_.setPermission(SECMODE_NO_ACCESS, SECMODE_OPEN);
  control_.setMaxLen(20);
  control_.setWriteCallback(controlWriteCb);
  control_.begin();

  config_.setProperties(CHR_PROPS_WRITE | CHR_PROPS_READ);
  config_.setPermission(SECMODE_OPEN, SECMODE_OPEN);
  config_.setFixedLen(sizeof(vbt_config_t));
  config_.setWriteCallback(configWriteCb);
  config_.begin();

  Bluefruit.Advertising.addFlags(BLE_GAP_ADV_FLAGS_LE_ONLY_GENERAL_DISC_MODE);
  Bluefruit.Advertising.addTxPower();
  // El UUID del servicio va en el scan response para que la app pueda filtrar
  // y no le muestre al usuario todos los auriculares del gimnasio.
  Bluefruit.ScanResponse.addService(svc_);
  Bluefruit.ScanResponse.addName();
  Bluefruit.Advertising.restartOnDisconnect(false);  // lo maneja la maquina
  return true;
}

BLECharacteristic *BluefruitStack::charFor(ble::Chr c) {
  switch (c) {
    case ble::Chr::kRepResult:   return &rep_;
    case ble::Chr::kSetSummary:  return &summary_;
    case ble::Chr::kControl:     return &control_;
    case ble::Chr::kConfig:      return &config_;
    case ble::Chr::kStatus:      return &status_;
    case ble::Chr::kRawStream:   return &raw_;
    case ble::Chr::kLogDump:     return &dump_;
    case ble::Chr::kBatteryLevel: return nullptr;  // lo maneja BLEBas
  }
  return nullptr;
}

bool BluefruitStack::notify(ble::Chr c, const uint8_t *data, uint16_t len) {
  if (!connected_) return false;
  if (c == ble::Chr::kBatteryLevel) {
    bas_.notify(data[0]);
    return true;
  }
  BLECharacteristic *chr = charFor(c);
  return chr ? chr->notify(data, len) : false;
}

bool BluefruitStack::setValue(ble::Chr c, const uint8_t *data, uint16_t len) {
  if (c == ble::Chr::kBatteryLevel) {
    bas_.write(data[0]);
    return true;
  }
  BLECharacteristic *chr = charFor(c);
  return chr ? chr->write(data, len) > 0 : false;
}

void BluefruitStack::startAdvertising() {
  if (!Bluefruit.Advertising.isRunning()) {
    // Intervalo rapido 20-152 ms durante los primeros 30 s (para que conecte
    // enseguida cuando el usuario abre la app), despues 1 s para ahorrar.
    Bluefruit.Advertising.setInterval(32, 1600);
    Bluefruit.Advertising.setFastTimeout(30);
    Bluefruit.Advertising.start(0);  // 0 = sin timeout; corta la maquina
  }
}

void BluefruitStack::stopAdvertising() {
  if (Bluefruit.Advertising.isRunning()) Bluefruit.Advertising.stop();
}

void BluefruitStack::onConnectCb(uint16_t handle) {
  connected_ = true;
  ev_connected_ = true;
  BLEConnection *conn = Bluefruit.Connection(handle);
  if (conn) {
    // Pedir MTU grande para los lotes de datos crudos. Si el central no lo
    // concede, el servicio manda menos muestras por notificacion en vez de
    // fallar en silencio.
    conn->requestMtuExchange(247);
    mtu_ = conn->getMtu();
  }
}

void BluefruitStack::onDisconnectCb(uint16_t, uint8_t) {
  connected_ = false;
  ev_disconnected_ = true;
  mtu_ = 23;
}

bool BluefruitStack::takeConnectedEvent() {
  if (!ev_connected_) return false;
  ev_connected_ = false;
  // El MTU se negocia despues del connect: se relee aca.
  if (Bluefruit.connected()) {
    BLEConnection *conn = Bluefruit.Connection(Bluefruit.connHandle());
    if (conn) mtu_ = conn->getMtu();
  }
  return true;
}

bool BluefruitStack::takeDisconnectedEvent() {
  if (!ev_disconnected_) return false;
  ev_disconnected_ = false;
  return true;
}

void BluefruitStack::stashControlWrite(const uint8_t *data, uint16_t len) {
  if (len > sizeof(ctrl_buf_)) len = sizeof(ctrl_buf_);
  memcpy(ctrl_buf_, data, len);
  ctrl_len_ = len;
}

void BluefruitStack::stashConfigWrite(const uint8_t *data, uint16_t len) {
  if (len > sizeof(cfg_buf_)) len = sizeof(cfg_buf_);
  memcpy(cfg_buf_, data, len);
  cfg_len_ = len;
}

bool BluefruitStack::takeControlWrite(uint8_t *out, uint16_t *len) {
  if (ctrl_len_ == 0) return false;
  *len = ctrl_len_;
  memcpy(out, ctrl_buf_, ctrl_len_);
  ctrl_len_ = 0;
  return true;
}

bool BluefruitStack::takeConfigWrite(uint8_t *out, uint16_t *len) {
  if (cfg_len_ == 0) return false;
  *len = cfg_len_;
  memcpy(out, cfg_buf_, cfg_len_);
  cfg_len_ = 0;
  return true;
}

// ---------------------------------------------------------------------------
// LED
// ---------------------------------------------------------------------------

void initLed() {
  pinMode(kPinLedRed, OUTPUT);
  pinMode(kPinLedGreen, OUTPUT);
  pinMode(kPinLedBlue, OUTPUT);
  writeLed(app::LedOutput{});  // apagado
}

void writeLed(const app::LedOutput &out) {
  // ANODO COMUN: se invierte. Este es el UNICO lugar del proyecto donde se
  // hace la inversion. Si el LED queda al reves, el problema esta aca.
  analogWrite(kPinLedRed, 255 - out.r);
  analogWrite(kPinLedGreen, 255 - out.g);
  analogWrite(kPinLedBlue, 255 - out.b);
}

// ---------------------------------------------------------------------------
// Bateria
// ---------------------------------------------------------------------------

void initBattery() {
  pinMode(kPinVbatEnable, OUTPUT);
  digitalWrite(kPinVbatEnable, HIGH);  // divisor desconectado (activo en BAJO)
  pinMode(kPinVbat, INPUT);
  analogReference(AR_INTERNAL_3_0);
  analogReadResolution(12);
}

uint16_t readBatteryMillivolts() {
  digitalWrite(kPinVbatEnable, LOW);  // conectar el divisor
  delayMicroseconds(200);             // que se estabilice

  // Promediar: el ADC del nRF52840 tiene ruido de varios mV y una sola
  // lectura hace bailar el porcentaje.
  //
  // IMPORTANTE: quien llama tiene que asegurarse de NO medir durante una
  // transmision de radio. El pico de corriente hunde la tension y el sensor
  // lee 3,7 V cuando en reposo hay 3,9: unos 40 puntos de porcentaje de
  // diferencia. En el lazo principal se mide solo cuando no hay actividad.
  uint32_t suma = 0;
  for (uint8_t i = 0; i < kBatteryAverageSamples; ++i) {
    suma += analogRead(kPinVbat);
  }
  digitalWrite(kPinVbatEnable, HIGH);

  const float cuentas = (float)suma / kBatteryAverageSamples;
  const float v_adc = cuentas * kAdcVoltsFullScale / kAdcCounts;
  return (uint16_t)(v_adc * kVbatDividerRatio * 1000.0f);
}

bool isCharging() {
  // El BQ25101 maneja la carga solo y tiene su propio LED naranja. No expone
  // una senal digital util en esta placa, asi que se infiere: si la tension
  // esta por encima de lo que puede dar una LiPo cargada, hay USB conectado.
  return readBatteryMillivolts() > 4250;
}

// ---------------------------------------------------------------------------
// Sueno e interrupciones
// ---------------------------------------------------------------------------

void sleepUntilEvent() {
  // System ON idle: mantiene RAM y estado, ~2 uA. Despierta con cualquier
  // interrupcion (el INT1 del IMU, un timer, la radio).
  //
  // NO se usa sd_power_system_off(): consume menos pero RESETEA el micro al
  // despertar, y perder el estado obligaria a reconstruirlo cada vez.
  waitForEvent();
}

void enableImuWakeInterrupt(void (*handler)()) {
  pinMode(kPinImuInt1, INPUT);
  attachInterrupt(digitalPinToInterrupt(kPinImuInt1), handler, RISING);
}

}  // namespace platform
}  // namespace vbt

#endif  // VBT_TARGET_NRF52
