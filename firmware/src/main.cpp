// Firmware del sensor VBT — lazo principal.
//
// Este archivo no tiene logica propia a proposito: sólo conecta piezas que ya
// estan probadas por separado en la PC. Si algo se comporta raro, el problema
// casi seguro esta en la capa de plataforma (los pines) y no aca.
//
// El flujo de uso que implementa esta descrito en docs/DECISIONS.md D1-D4.

#ifdef VBT_TARGET_NRF52

#include <Arduino.h>

#include "algo/rep_detector.h"
#include "app/battery.h"
#include "app/led.h"
#include "app/power.h"
#include "app/state_machine.h"
#include "ble/vbt_service.h"
#include "drivers/lsm6ds3tr.h"
#include "platform/platform.h"
#include "app/log_dumper.h"
#include "storage/log_store.h"

using namespace vbt;

namespace {

// --- Plataforma ---
platform::ArduinoI2C g_i2c;
platform::QspiFlash g_flash;
platform::BluefruitStack g_ble;

// --- Piezas del firmware ---
Lsm6ds3tr g_imu(g_i2c);
algo::RepDetector g_detector;
algo::Config g_algo_cfg;
app::StateMachine g_machine;
app::Config g_app_cfg;
app::LedController g_led;
app::BatteryMonitor g_battery;
ble::VbtService g_service;
// Los umbrales que se calibran por BLE desde el gimnasio. Viven aca porque el
// servicio BLE solo los guarda: bajarlos a los registros del chip es tarea de
// esta capa.
ble::SensorTuning g_tuning;
LogStore g_log;
app::LogDumper g_dumper;

// --- Estado del lazo ---
volatile bool g_imu_interrupt = false;
uint32_t g_last_status_ms = 0;
uint32_t g_last_battery_ms = 0;
uint32_t g_last_led_ms = 0;
uint32_t g_set_start_ms = 0;
uint8_t g_set_index = 0;
uint8_t g_exercise_id = 0;
uint16_t g_load_kg_x10 = 0;
bool g_logging = false;
bool g_streaming = false;
bool g_saturated_recently = false;
vbt_error_t g_last_error = VBT_ERR_NONE;
app::ImuMode g_imu_mode_applied = app::ImuMode::kOff;
bool g_advertising_applied = false;

void onImuInterrupt() { g_imu_interrupt = true; }

// Aplica al hardware lo que la maquina de estados quiere. La maquina decide,
// esto obedece: toda la logica es testeable, esto no necesita serlo.
// Traduce los valores que llegaron por BLE a las structs del driver. Un solo
// lugar: si la conversion viviera en cada punto de uso, alcanzaria con olvidar
// uno para que el sensor quedara con dos configuraciones distintas segun por
// que camino se llego.
TapConfig tapDesdeTuning() {
  TapConfig t;
  t.threshold = g_tuning.tap_ths;
  t.shock = g_tuning.tap_shock;
  t.quiet = g_tuning.tap_quiet;
  t.duration = g_tuning.tap_dur;
  return t;
}

WakeConfig wakeDesdeTuning() {
  WakeConfig w;
  // WK_THS[5:0], LSB = FS_XL/64. Con +-8 g cada cuenta son 125 mg.
  uint16_t cuentas = (uint16_t)(g_tuning.wake_ths_mg / 125u);
  if (cuentas > 63) cuentas = 63;
  if (cuentas == 0) cuentas = 1;
  w.threshold = (uint8_t)cuentas;
  // WAKE_DUR[1:0] cuenta ciclos de ODR, no milisegundos.
  uint32_t ciclos = ((uint32_t)g_tuning.wake_dur_ms * g_algo_cfg.odr_hz) / 1000u;
  w.duration = (uint8_t)(ciclos > 3 ? 3 : ciclos);
  return w;
}

// Los cambios que llegan por BLE no tocan el hardware en el momento: el chip
// puede estar en medio de una serie. Se aplican aca, en el proximo cambio de
// modo, y recien entonces se baja el flag.
void aplicarTuningPendiente() {
  if (!g_tuning.dirty) return;
  g_led.configure(g_tuning.led_brightness);
  if (g_imu_mode_applied == app::ImuMode::kTapArmed) {
    g_imu.enableDoubleTap(tapDesdeTuning());
  } else if (g_imu_mode_applied == app::ImuMode::kWakeOnMotion) {
    g_imu.enableWakeOnMotion(wakeDesdeTuning());
  }
  g_tuning.dirty = false;
}

void applyPowerPlan(app::State state) {
  const app::PowerPlan plan = app::planFor(state, g_logging);

  if (plan.imu != g_imu_mode_applied) {
    switch (plan.imu) {
      case app::ImuMode::kOff:
        g_imu.powerDown();
        break;
      case app::ImuMode::kWakeOnMotion:
        g_imu.stopStreaming();
        g_imu.enableWakeOnMotion(wakeDesdeTuning());
        break;
      case app::ImuMode::kTapArmed:
        g_imu.enableDoubleTap(tapDesdeTuning());
        break;
      case app::ImuMode::kFull:
        g_imu.disableWakeOnMotion();
        g_imu.startStreaming();
        break;
    }
    g_imu_mode_applied = plan.imu;
    g_tuning.dirty = false;  // se acaba de aplicar lo ultimo
  } else {
    aplicarTuningPendiente();
  }

  if (plan.flash_deep_power_down) {
    g_flash.powerDown();
  } else {
    g_flash.powerUp();
  }

  if (plan.radio_advertising != g_advertising_applied) {
    if (plan.radio_advertising) {
      g_ble.startAdvertising();
    } else {
      g_ble.stopAdvertising();
    }
    g_advertising_applied = plan.radio_advertising;
  }
}

ble::StatusInfo buildStatus(uint32_t now_ms) {
  ble::StatusInfo info;
  info.state = g_machine.state();
  info.battery_pct = g_battery.percent();
  info.battery_mv = g_battery.millivolts();
  info.rep_count = g_machine.repCount();
  info.exercise_id = g_exercise_id;
  info.uptime_s = now_ms / 1000;
  info.log_free_bytes = g_log.freeBytes();
  info.last_error = g_last_error;
  info.imu_ok = g_imu.lastStatus() != ImuStatus::kNoAck &&
                g_imu.lastStatus() != ImuStatus::kBadWhoAmI;
  info.charging = g_battery.isCharging();
  info.log_full = g_log.isFull();
  info.saturated_recently = g_saturated_recently;
  info.calibrated = g_machine.calibrated();
  // Hay ajustes escritos por BLE que todavia no bajaron al chip. La app lo
  // muestra: sin esto mostraria el valor nuevo como si ya estuviera en uso.
  info.config_dirty = g_tuning.dirty;
  return info;
}

void closeSet(uint32_t now_ms) {
  g_service.notifySetSummary(g_set_index, g_machine.repCount(), g_exercise_id,
                             g_load_kg_x10, now_ms - g_set_start_ms);
  if (g_log.isRecording()) g_log.endSession();
  g_set_index++;
}

void handleCommand(const ble::Command &cmd, uint32_t now_ms) {
  if (!cmd.valid) {
    if (cmd.error != VBT_ERR_NONE) g_last_error = cmd.error;
    return;  // comando basura: se ignora y se sigue, nunca se resetea
  }

  switch (cmd.opcode) {
    case VBT_OP_SET_START:
      g_exercise_id = cmd.exercise_id;
      g_load_kg_x10 = cmd.load_kg_x10;
      g_set_start_ms = now_ms;
      g_service.startSet();
      g_detector.startSet();
      g_machine.onEvent(app::Event::kSetStart, now_ms);
      break;

    case VBT_OP_SET_STOP:
      if (g_machine.state() == app::State::kRecording ||
          g_machine.state() == app::State::kCalibrating) {
        g_machine.onEvent(app::Event::kSetStop, now_ms);
        closeSet(now_ms);
      }
      break;

    case VBT_OP_SLEEP:
      g_machine.onEvent(app::Event::kSleepCommand, now_ms);
      break;

    case VBT_OP_MODE_LOGGER:
      g_logging = cmd.enable;
      if (cmd.enable) {
        SessionHeader h{};
        h.odr_hz = (uint16_t)g_algo_cfg.odr_hz;
        h.accel_fs_g = 8;
        h.gyro_fs_dps = 1000;
        h.exercise_id = g_exercise_id;
        h.load_kg_x10 = g_load_kg_x10;
        if (!g_log.startSession(h)) g_last_error = VBT_ERR_LOG_FULL;
        g_machine.onEvent(app::Event::kLoggerOn, now_ms);
      } else {
        g_log.endSession();
        g_machine.onEvent(app::Event::kLoggerOff, now_ms);
      }
      break;

    case VBT_OP_MODE_RAWSTREAM:
      g_streaming = cmd.enable;
      break;

    case VBT_OP_LOG_ERASE:
      g_log.beginErase();  // se completa de a un sector en el lazo
      break;

    case VBT_OP_FACTORY_RESET:
      g_algo_cfg = algo::Config{};
      g_app_cfg = app::Config{};
      g_detector.configure(g_algo_cfg);
      g_machine.configure(g_app_cfg);
      break;

    case VBT_OP_LOG_DUMP: {
      /* Toda la logica del volcado vive en app::LogDumper para que la cubran
         los tests de PC: main.cpp no lo compila el build del host. */
      const vbt_error_t e = g_dumper.empezar(cmd.session_id);
      if (e != VBT_ERR_NONE) g_last_error = e;
      break;
    }

    case VBT_OP_LOG_LIST:
      g_dumper.empezarIndice();
      break;

    default:
      break;  // SET_TIME y CALIB_ODR: pendientes
  }
}

}  // namespace

void setup() {
  Serial.begin(115200);

  platform::initLed();
  platform::initBattery();

  // El IMU esta alimentado por un GPIO: hay que prenderlo y esperar ANTES de
  // hablarle por I2C. Sin esto el bus no contesta y parece placa quemada.
  pinMode(platform::kPinImuPower, OUTPUT);
  digitalWrite(platform::kPinImuPower, HIGH);
  delay(platform::kImuPowerUpDelayMs);

  g_i2c.begin();

  ImuConfig imu_cfg;
  const ImuStatus st = g_imu.begin(imu_cfg);
  if (st != ImuStatus::kOk) {
    // Si el WHO_AM_I da 0x00 o 0xFF, lo mas probable es que el pin de
    // alimentacion del IMU no sea el que dice board.h. Ver docs/BRINGUP.md.
    Serial.printf("IMU fallo: status=%d who_am_i=0x%02X\n", (int)st,
                  g_imu.whoAmI());
    g_last_error = st == ImuStatus::kBadWhoAmI ? VBT_ERR_IMU_WHOAMI
                                               : VBT_ERR_IMU_NO_ACK;
  }

  g_flash.begin();
  g_log.begin(g_flash);

  g_algo_cfg.odr_hz = (float)Lsm6ds3tr::odrHz(imu_cfg.odr);
  g_detector.configure(g_algo_cfg);
  g_machine.configure(g_app_cfg);
  g_led.configure(g_tuning.led_brightness);
  g_battery.configure();

  g_ble.begin();
  g_service.begin(g_ble, g_algo_cfg, g_app_cfg, g_tuning);
  g_dumper.begin(g_log, g_service);

  platform::enableImuWakeInterrupt(onImuInterrupt);

  const uint32_t now = millis();
  g_machine.reset(now);
  if (g_last_error != VBT_ERR_NONE) {
    g_machine.onEvent(app::Event::kImuFailed, now);
  }
  g_battery.update(platform::readBatteryMillivolts());
}

void loop() {
  const uint32_t now = millis();

  // --- Eventos de conexion ---------------------------------------------
  if (g_ble.takeConnectedEvent()) {
    g_machine.onEvent(app::Event::kConnected, now);
    g_service.notifyStatus(buildStatus(now));
  }
  if (g_ble.takeDisconnectedEvent()) {
    g_machine.onEvent(app::Event::kDisconnected, now);
  }

  // --- Comandos del celular --------------------------------------------
  uint8_t buf[20];
  uint16_t len = 0;
  if (g_ble.takeControlWrite(buf, &len)) {
    handleCommand(g_service.onControlWrite(buf, len), now);
  }
  if (g_ble.takeConfigWrite(buf, &len)) {
    const vbt_error_t e = g_service.onConfigWrite(buf, len);
    if (e != VBT_ERR_NONE) {
      g_last_error = e;
    } else {
      // Los umbrales cambiaron desde el celular: se recargan en caliente.
      // Es lo que permite calibrar en el gimnasio sin recompilar.
      g_detector.configure(g_algo_cfg);
      g_machine.configure(g_app_cfg);
    }
  }

  // --- Volcado del log --------------------------------------------------
  // Varios lotes por vuelta para que la descarga no tarde una eternidad, pero
  // con tope: el lazo tiene que volver a atender comandos y desconexiones.
  // Sin el tope, un volcado de megabytes deja al sensor sordo.
  for (int i = 0; i < 4 && g_dumper.paso(g_ble.isConnected()); ++i) { }

  // --- Despertares del IMU ---------------------------------------------
  if (g_imu_interrupt) {
    g_imu_interrupt = false;
    if (g_imu.tapOccurred()) {
      g_machine.onEvent(app::Event::kDoubleTap, now);
    } else if (g_imu.motionOccurred()) {
      // TODO(hardware): antes de aceptarlo hay que validar el movimiento
      // (>2 g, horizontal, sostenido 2-3 s) leyendo unas muestras. Los
      // umbrales se calibran con la carcasa puesta.
      g_machine.onEvent(app::Event::kMotionValidated, now);
    }
  }

  // --- Muestras del IMU -------------------------------------------------
  const app::State state = g_machine.state();
  if (state == app::State::kRecording || state == app::State::kCalibrating ||
      state == app::State::kLogger) {
    ImuSample raw[VBT_BATCH_MAX_SAMPLES];
    const uint16_t n = g_imu.readFifo(raw, VBT_BATCH_MAX_SAMPLES);

    if (g_imu.lastStatus() == ImuStatus::kFifoOverrun) {
      g_last_error = VBT_ERR_FIFO_OVERRUN;  // el lazo esta llegando tarde
    }

    for (uint16_t i = 0; i < n; ++i) {
      if (Lsm6ds3tr::isSaturated(raw[i])) g_saturated_recently = true;

      algo::Sample s;
      s.ax = raw[i].ax * VBT_ACCEL_LSB_MG / 1000.0f;
      s.ay = raw[i].ay * VBT_ACCEL_LSB_MG / 1000.0f;
      s.az = raw[i].az * VBT_ACCEL_LSB_MG / 1000.0f;
      s.gx = raw[i].gx * VBT_GYRO_LSB_MDPS / 1000.0f;
      s.gy = raw[i].gy * VBT_GYRO_LSB_MDPS / 1000.0f;
      s.gz = raw[i].gz * VBT_GYRO_LSB_MDPS / 1000.0f;

      const uint32_t t_ms = now + (uint32_t)(i * 1000.0f / g_algo_cfg.odr_hz);

      // La maquina necesita saber si hay movimiento: alimenta la calibracion
      // y el cierre automatico de la serie.
      g_machine.notifyStill(g_detector.isStill(), t_ms);
      if (!g_detector.isStill()) g_machine.notifyMotion(t_ms);

      if (state == app::State::kRecording && g_detector.update(s, t_ms)) {
        const algo::RepMetrics &m = g_detector.lastRep();
        g_machine.onEvent(app::Event::kRepDetected, t_ms);
        g_service.trackRep(m);
        g_service.notifyRep(m, g_machine.repCount(), g_set_index);
      }
    }

    if (n > 0) {
      if (g_logging && g_log.isRecording()) {
        if (!g_log.writeRaw((const int16_t *)raw, n)) {
          g_last_error = VBT_ERR_LOG_FULL;  // se lleno: se detiene y avisa
        }
      }
      if (g_streaming) {
        g_service.notifySamples((const int16_t *)raw, (uint8_t)n,
                                micros());
      }
    }
  }

  // --- Vencimientos por tiempo -----------------------------------------
  const app::State antes = g_machine.state();
  g_machine.tick(now);
  if (antes == app::State::kRecording &&
      g_machine.state() == app::State::kConnectedIdle) {
    closeSet(now);  // se cerro sola por inactividad
  }

  // --- Borrado de la flash, de a un sector ------------------------------
  if (g_log.isErasing()) g_log.eraseStep();

  // --- Bateria ----------------------------------------------------------
  // Se mide sólo fuera de las fases activas: medir mientras la radio
  // transmite da lecturas 200 mV mas bajas de lo real.
  if (now - g_last_battery_ms >= platform::kBatteryIntervalMs &&
      state != app::State::kRecording && state != app::State::kLogger) {
    g_last_battery_ms = now;
    g_battery.setCharging(platform::isCharging());
    g_battery.update(platform::readBatteryMillivolts());
    g_service.notifyBattery(g_battery.percent());
    if (g_battery.isCritical()) {
      g_machine.onEvent(app::Event::kBatteryCritical, now);
    }
  }
  g_machine.setBattery(g_battery.percent());

  // --- Status periodico -------------------------------------------------
  if (now - g_last_status_ms >= platform::kStatusIntervalMs &&
      g_ble.isConnected()) {
    g_last_status_ms = now;
    g_service.notifyStatus(buildStatus(now));
  }

  // --- LED --------------------------------------------------------------
  if (now - g_last_led_ms >= platform::kLedUpdateMs) {
    g_last_led_ms = now;
    platform::writeLed(g_led.update(g_machine.led(), now));
  }

  // --- Energia ----------------------------------------------------------
  applyPowerPlan(g_machine.state());

  // En reposo el micro duerme entre eventos. Es la diferencia entre 3,5 mA y
  // 2 uA: sin esto, la autonomia pasa de meses a dias.
  if (app::planFor(g_machine.state(), g_logging).mcu_can_sleep) {
    platform::sleepUntilEvent();
  }
}

#endif  // VBT_TARGET_NRF52
