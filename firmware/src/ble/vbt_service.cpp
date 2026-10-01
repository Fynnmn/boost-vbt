#include "ble/vbt_service.h"

#include <string.h>

namespace vbt {
namespace ble {

void VbtService::begin(IBleStack &stack, algo::Config &algo_cfg,
                       app::Config &app_cfg, SensorTuning &tuning) {
  stack_ = &stack;
  algo_cfg_ = &algo_cfg;
  app_cfg_ = &app_cfg;
  tuning_ = &tuning;
  seq_ = 0;
  startSet();
}

uint16_t VbtService::toMillis(float value) {
  // Metros o m/s -> milimetros o mm/s, saturando. Los negativos van a cero:
  // el protocolo usa enteros sin signo, y una velocidad concentrica negativa
  // no significa nada. Sin este recorte, -0,1 m/s se convertiria en 65435
  // mm/s y la app mostraria una rep a 65 m/s.
  if (value <= 0.0f) return 0;
  const float mm = value * 1000.0f;
  if (mm >= 65535.0f) return 65535;
  return (uint16_t)mm;
}

void VbtService::startSet() {
  best_vel_ = 0.0f;
  first_vel_ = 0.0f;
  last_vel_ = 0.0f;
  set_flags_ = 0;
  reps_in_set_ = 0;
}

void VbtService::trackRep(const algo::RepMetrics &m) {
  if (reps_in_set_ == 0) first_vel_ = m.mean_conc_vel;
  if (m.mean_conc_vel > best_vel_) best_vel_ = m.mean_conc_vel;
  last_vel_ = m.mean_conc_vel;
  set_flags_ |= m.quality_flags;
  if (reps_in_set_ < 255) reps_in_set_++;
}

bool VbtService::notifyRep(const algo::RepMetrics &m, uint8_t rep_index,
                           uint8_t set_index) {
  if (!stack_) return false;

  vbt_rep_result_t p{};
  p.schema = VBT_SCHEMA_VERSION;
  p.rep_index = rep_index;
  p.mean_conc_vel = toMillis(m.mean_conc_vel);
  p.mean_prop_vel = toMillis(m.mean_prop_vel);
  p.peak_vel = toMillis(m.peak_vel);
  p.rom = toMillis(m.rom);
  p.conc_dur_ms = m.conc_dur_ms;
  p.ecc_dur_ms = m.ecc_dur_ms;
  p.pause_ms = m.pause_ms;
  p.quality_flags = m.quality_flags;
  p.peak_vel_pos = m.peak_vel_pos > 100 ? 100 : m.peak_vel_pos;
  p.set_index = set_index;

  return stack_->notify(Chr::kRepResult, (const uint8_t *)&p, sizeof(p));
}

bool VbtService::notifySetSummary(uint8_t set_index, uint8_t rep_count,
                                  uint8_t exercise_id, uint16_t load_kg_x10,
                                  uint32_t duration_ms) {
  if (!stack_) return false;

  vbt_set_summary_t p{};
  p.schema = VBT_SCHEMA_VERSION;
  p.set_index = set_index;
  p.rep_count = rep_count;
  p.exercise_id = exercise_id;
  p.best_mean_vel = toMillis(best_vel_);
  p.first_rep_vel = toMillis(first_vel_);
  p.last_rep_vel = toMillis(last_vel_);
  p.load_kg_x10 = load_kg_x10;
  p.duration_ms = duration_ms;
  p.flags = set_flags_;

  // Perdida de velocidad contra la MEJOR rep, no contra la primera: si la
  // primera salio mal (mal agarre, mal acomodado), arrastraria el calculo
  // entero y mostraria una fatiga que no existio.
  if (best_vel_ > 0.0f && last_vel_ >= 0.0f) {
    const float perdida = (best_vel_ - last_vel_) / best_vel_ * 1000.0f;
    p.velocity_loss_x10 = perdida <= 0.0f ? 0
                          : (perdida >= 65535.0f ? 65535
                                                 : (uint16_t)perdida);
  }

  return stack_->notify(Chr::kSetSummary, (const uint8_t *)&p, sizeof(p));
}

bool VbtService::notifyStatus(const StatusInfo &info) {
  if (!stack_) return false;

  vbt_status_t p{};
  p.schema = VBT_SCHEMA_VERSION;
  p.state = (uint8_t)info.state;
  p.battery_pct = info.battery_pct;
  p.battery_mv = info.battery_mv;
  p.rep_count = info.rep_count;
  p.exercise_id = info.exercise_id;
  p.uptime_s = info.uptime_s;
  p.log_free_bytes = info.log_free_bytes;
  p.fw_version = (uint16_t)((VBT_FW_VERSION_MAJOR << 8) | VBT_FW_VERSION_MINOR);
  p.last_error = (uint8_t)info.last_error;

  if (info.imu_ok) p.flags |= VBT_SF_IMU_OK;
  if (info.charging) p.flags |= VBT_SF_CHARGING;
  if (info.log_full) p.flags |= VBT_SF_LOG_FULL;
  if (info.saturated_recently) p.flags |= VBT_SF_SATURATED_RECENT;
  if (info.config_dirty) p.flags |= VBT_SF_CONFIG_DIRTY;
  if (info.calibrated) p.flags |= VBT_SF_CALIBRATED;

  // Se publica ademas como valor legible: la app que recien se conecta puede
  // leer el estado sin esperar a la proxima notificacion.
  stack_->setValue(Chr::kStatus, (const uint8_t *)&p, sizeof(p));
  return stack_->notify(Chr::kStatus, (const uint8_t *)&p, sizeof(p));
}

bool VbtService::notifyBattery(uint8_t percent) {
  if (!stack_) return false;
  const uint8_t v = percent > 100 ? 100 : percent;
  // Battery Service estandar: iOS y Android muestran la bateria del sensor en
  // los ajustes del sistema sin una linea de codigo en la app.
  stack_->setValue(Chr::kBatteryLevel, &v, 1);
  return stack_->notify(Chr::kBatteryLevel, &v, 1);
}

uint8_t VbtService::notifySamples(const int16_t *xyz6, uint8_t n_samples,
                                  uint32_t t0_us) {
  if (!stack_ || n_samples == 0) return 0;

  // Cuantas muestras entran REALMENTE en este MTU. Si la negociacion de 247
  // fallo y quedamos en 23, entra una sola muestra por notificacion: es lento
  // pero funciona. Asumir 19 y mandar 236 bytes en un MTU de 23 haria que la
  // notificacion se descarte entera y el modo debug no anduviera nunca, sin
  // ningun mensaje de error.
  const uint16_t util = usablePayload(stack_->mtu());
  const uint16_t hdr = (uint16_t)sizeof(vbt_batch_header_t);
  if (util <= hdr) return 0;

  uint16_t caben = (uint16_t)((util - hdr) / sizeof(vbt_sample_t));
  if (caben == 0) return 0;
  if (caben > n_samples) caben = n_samples;
  if (caben > VBT_BATCH_MAX_SAMPLES) caben = VBT_BATCH_MAX_SAMPLES;

  uint8_t buf[VBT_BATCH_MAX_PAYLOAD];
  vbt_batch_header_t h{};
  h.schema = VBT_SCHEMA_VERSION;
  h.count = (uint8_t)caben;
  h.seq = seq_++;
  h.t0_us = t0_us;
  memcpy(buf, &h, hdr);
  memcpy(buf + hdr, xyz6, caben * sizeof(vbt_sample_t));

  const uint16_t total = (uint16_t)(hdr + caben * sizeof(vbt_sample_t));
  if (!stack_->notify(Chr::kRawStream, buf, total)) return 0;
  return (uint8_t)caben;
}

Command VbtService::onControlWrite(const uint8_t *data, uint16_t len) {
  Command cmd;

  // Un comando corto o con un esquema desconocido se ignora. NUNCA se cuelga
  // ni se resetea el firmware por lo que mande el central: cualquier app mal
  // programada, o cualquiera con nRF Connect, puede escribir basura aca.
  if (data == nullptr || len < 2) return cmd;
  if (data[0] != VBT_SCHEMA_VERSION) {
    cmd.error = VBT_ERR_BAD_OPCODE;
    return cmd;
  }

  const uint8_t op = data[1];
  const uint8_t *payload = data + 2;
  const uint16_t plen = (uint16_t)(len - 2);

  switch (op) {
    case VBT_OP_SET_START:
      if (plen < 3) {
        cmd.error = VBT_ERR_BAD_OPCODE;
        return cmd;
      }
      cmd.exercise_id = payload[0];
      cmd.load_kg_x10 = (uint16_t)(payload[1] | (payload[2] << 8));
      break;

    case VBT_OP_MODE_LOGGER:
    case VBT_OP_MODE_RAWSTREAM:
      if (plen < 1) {
        cmd.error = VBT_ERR_BAD_OPCODE;
        return cmd;
      }
      cmd.enable = payload[0] != 0;
      break;

    case VBT_OP_SET_TIME:
      if (plen < 4) {
        cmd.error = VBT_ERR_BAD_OPCODE;
        return cmd;
      }
      cmd.unix_s = (uint32_t)payload[0] | ((uint32_t)payload[1] << 8) |
                   ((uint32_t)payload[2] << 16) | ((uint32_t)payload[3] << 24);
      break;

    case VBT_OP_LOG_DUMP:
      if (plen < 2) {
        cmd.error = VBT_ERR_BAD_OPCODE;
        return cmd;
      }
      cmd.session_id = (uint16_t)(payload[0] | (payload[1] << 8));
      break;

    case VBT_OP_SET_STOP:
    case VBT_OP_SLEEP:
    case VBT_OP_LOG_ERASE:
    case VBT_OP_CALIB_ODR:
    case VBT_OP_FACTORY_RESET:
    case VBT_OP_LOG_LIST:
      break;  // sin payload

    default:
      cmd.error = VBT_ERR_BAD_OPCODE;
      return cmd;
  }

  cmd.opcode = (vbt_opcode_t)op;
  cmd.valid = true;
  return cmd;
}

bool VbtService::notifyLogHeader(const uint8_t *header32) {
  if (!stack_ || !header32) return false;

  const uint16_t hdr = (uint16_t)sizeof(vbt_batch_header_t);
  /* Sin MTU negociado no entran 8 + 32 bytes y la notificacion se descarta
     entera. Mejor no mandarla y que el volcado falle a la vista. */
  if (usablePayload(stack_->mtu()) < hdr + 32u) return false;

  uint8_t buf[VBT_BATCH_MAX_PAYLOAD];
  vbt_batch_header_t h{};
  h.schema = VBT_SCHEMA_VERSION;
  h.count = VBT_BATCH_SESSION_HDR;
  h.seq = seq_++;
  h.t0_us = 0;
  memcpy(buf, &h, hdr);
  memcpy(buf + hdr, header32, 32);
  return stack_->notify(Chr::kLogDump, buf, (uint16_t)(hdr + 32));
}

uint8_t VbtService::notifyLogSamples(const int16_t *xyz6, uint8_t n_samples) {
  if (!stack_ || n_samples == 0) return 0;

  const uint16_t util = usablePayload(stack_->mtu());
  const uint16_t hdr = (uint16_t)sizeof(vbt_batch_header_t);
  if (util <= hdr) return 0;

  uint16_t caben = (uint16_t)((util - hdr) / sizeof(vbt_sample_t));
  if (caben == 0) return 0;
  if (caben > n_samples) caben = n_samples;
  if (caben > VBT_BATCH_MAX_SAMPLES) caben = VBT_BATCH_MAX_SAMPLES;

  uint8_t buf[VBT_BATCH_MAX_PAYLOAD];
  vbt_batch_header_t h{};
  h.schema = VBT_SCHEMA_VERSION;
  h.count = (uint8_t)caben;
  h.seq = seq_++;
  /* En el volcado no hay timestamp por lote: las muestras salen de la flash y
     su tiempo se deduce del t0 del header y del ODR. Va en cero a proposito,
     para que nadie lea un reloj que no significa nada. */
  h.t0_us = 0;
  memcpy(buf, &h, hdr);
  memcpy(buf + hdr, xyz6, caben * sizeof(vbt_sample_t));

  const uint16_t total = (uint16_t)(hdr + caben * sizeof(vbt_sample_t));
  if (!stack_->notify(Chr::kLogDump, buf, total)) return 0;
  return (uint8_t)caben;
}

bool VbtService::notifyLogEnd(uint32_t total_muestras) {
  if (!stack_) return false;
  vbt_batch_header_t h{};
  h.schema = VBT_SCHEMA_VERSION;
  h.count = VBT_BATCH_END;
  h.seq = seq_++;
  h.t0_us = total_muestras;
  return stack_->notify(Chr::kLogDump, (const uint8_t *)&h, sizeof(h));
}

bool VbtService::readParam(uint8_t param_id) {
  if (!stack_ || !algo_cfg_ || !app_cfg_ || !tuning_) return false;

  // El tipo sale de la tabla y no de este switch: si los dos pudieran
  // discrepar, la app decodificaria con un ancho y el sensor con otro.
  const vbt_param_spec_t *spec = vbt_param_spec(param_id);
  if (!spec) return false;

  uint32_t valor = 0;
  switch (param_id) {
    case VBT_P_TAP_THS:   valor = tuning_->tap_ths; break;
    case VBT_P_TAP_SHOCK: valor = tuning_->tap_shock; break;
    case VBT_P_TAP_QUIET: valor = tuning_->tap_quiet; break;
    case VBT_P_TAP_DUR:   valor = tuning_->tap_dur; break;
    case VBT_P_WAKE_THS_MG: valor = tuning_->wake_ths_mg; break;
    case VBT_P_WAKE_DUR_MS: valor = tuning_->wake_dur_ms; break;
    case VBT_P_SLEEP_TIMEOUT_S: valor = tuning_->sleep_timeout_s; break;
    case VBT_P_LED_BRIGHTNESS: valor = tuning_->led_brightness; break;

    case VBT_P_ODR_HZ: valor = (uint32_t)algo_cfg_->odr_hz; break;
    // Solo lectura: la app las necesita para saber contra que escala esta
    // midiendo. Salen de la tabla porque el driver las fija al arrancar.
    case VBT_P_ACCEL_FS_G:
    case VBT_P_GYRO_FS_DPS:
    case VBT_P_ODR_CALIB_PPM:
      valor = spec->def;
      break;

    case VBT_P_ZUPT_ACC_TOL_MG:
      valor = (uint32_t)(algo_cfg_->zupt_acc_tol_g * 1000.0f);
      break;
    case VBT_P_ZUPT_GYR_TOL_MDPS:
      valor = (uint32_t)(algo_cfg_->zupt_gyr_tol_dps * 1000.0f);
      break;
    case VBT_P_REP_MIN_ROM_MM:
      valor = (uint32_t)(algo_cfg_->rep_min_rom_m * 1000.0f);
      break;
    case VBT_P_REP_MAX_ROM_MM:
      valor = (uint32_t)(algo_cfg_->rep_max_rom_m * 1000.0f);
      break;
    case VBT_P_REP_MIN_DUR_MS: valor = algo_cfg_->rep_min_dur_ms; break;
    case VBT_P_REP_MAX_DUR_MS: valor = algo_cfg_->rep_max_dur_ms; break;

    case VBT_P_ADV_WINDOW_MIN: valor = app_cfg_->adv_window_ms / 60000u; break;
    case VBT_P_SET_END_TIMEOUT_S:
      valor = app_cfg_->set_end_timeout_ms / 1000u;
      break;
    case VBT_P_CALIB_MIN_MS: valor = app_cfg_->calib_min_ms; break;
    case VBT_P_TRAVEL_TIMEOUT_M:
      valor = app_cfg_->travel_timeout_ms / 60000u;
      break;
    default:
      // Esta en la tabla pero nadie lo lee: es un olvido al agregarlo, no una
      // peticion invalida. Mejor fallar que devolver un cero que parece dato.
      return false;
  }

  vbt_config_t out{};
  out.schema = VBT_SCHEMA_VERSION;
  out.param_id = param_id;
  out.param_type = spec->param_type;
  memcpy(out.value, &valor, 4);
  return stack_->setValue(Chr::kConfig, (const uint8_t *)&out, sizeof(out));
}

vbt_error_t VbtService::writeParam(uint8_t param_id, uint8_t type,
                                   const uint8_t *value) {
  if (!algo_cfg_ || !app_cfg_ || !tuning_) return VBT_ERR_BAD_PARAM;

  const vbt_param_spec_t *spec = vbt_param_spec(param_id);
  if (!spec) return VBT_ERR_BAD_PARAM;

  // El tipo tiene que coincidir con el de la tabla. Antes se ignoraba, y
  // escribir un u8 declarando float reinterpretaba los bytes en silencio.
  if (type != spec->param_type) return VBT_ERR_BAD_PARAM;
  if (!spec->writable) return VBT_ERR_BAD_PARAM;

  uint32_t v = 0;
  memcpy(&v, value, 4);
  // Los tipos angostos no ocupan los 4 bytes: sin recortar, un u8 con basura
  // en los bytes altos pasaria el rango por accidente.
  if (spec->param_type == VBT_PARAM_TYPE_U8) v &= 0xFFu;
  else if (spec->param_type == VBT_PARAM_TYPE_U16) v &= 0xFFFFu;

  // El rango es lo unico que separa un ajuste de dejar el sensor inutil.
  if (v < spec->min || v > spec->max) return VBT_ERR_BAD_PARAM;

  // Cruces que ningun rango individual atrapa: min y max pueden ser validos
  // por separado y dejar una ventana vacia, con lo cual el sensor no cuenta
  // una sola repeticion. Se comprueba ANTES de escribir: rechazar es trivial,
  // revertir a medias es como se cuelan los estados inconsistentes.
  const uint32_t rom_min_mm = (uint32_t)(algo_cfg_->rep_min_rom_m * 1000.0f);
  const uint32_t rom_max_mm = (uint32_t)(algo_cfg_->rep_max_rom_m * 1000.0f);
  switch (param_id) {
    case VBT_P_REP_MIN_ROM_MM:
      if (v >= rom_max_mm) return VBT_ERR_BAD_PARAM;
      break;
    case VBT_P_REP_MAX_ROM_MM:
      if (v <= rom_min_mm) return VBT_ERR_BAD_PARAM;
      break;
    case VBT_P_REP_MIN_DUR_MS:
      if (v >= algo_cfg_->rep_max_dur_ms) return VBT_ERR_BAD_PARAM;
      break;
    case VBT_P_REP_MAX_DUR_MS:
      if (v <= algo_cfg_->rep_min_dur_ms) return VBT_ERR_BAD_PARAM;
      break;
    default:
      break;
  }

  switch (param_id) {
    case VBT_P_TAP_THS:   tuning_->tap_ths = (uint8_t)v; break;
    case VBT_P_TAP_SHOCK: tuning_->tap_shock = (uint8_t)v; break;
    case VBT_P_TAP_QUIET: tuning_->tap_quiet = (uint8_t)v; break;
    case VBT_P_TAP_DUR:   tuning_->tap_dur = (uint8_t)v; break;
    case VBT_P_WAKE_THS_MG: tuning_->wake_ths_mg = (uint16_t)v; break;
    case VBT_P_WAKE_DUR_MS: tuning_->wake_dur_ms = (uint16_t)v; break;
    case VBT_P_SLEEP_TIMEOUT_S: tuning_->sleep_timeout_s = (uint16_t)v; break;
    case VBT_P_LED_BRIGHTNESS: tuning_->led_brightness = (uint8_t)v; break;

    case VBT_P_ZUPT_ACC_TOL_MG:
      // El parametro mas sensible del algoritmo. Poder cambiarlo desde el
      // celular, en el gimnasio, es la diferencia entre iterar diez veces en
      // una sesion o dos veces por semana.
      algo_cfg_->zupt_acc_tol_g = (float)v / 1000.0f;
      break;
    case VBT_P_ZUPT_GYR_TOL_MDPS:
      algo_cfg_->zupt_gyr_tol_dps = (float)v / 1000.0f;
      break;
    case VBT_P_REP_MIN_ROM_MM:
      algo_cfg_->rep_min_rom_m = (float)v / 1000.0f;
      break;
    case VBT_P_REP_MAX_ROM_MM:
      algo_cfg_->rep_max_rom_m = (float)v / 1000.0f;
      break;
    case VBT_P_REP_MIN_DUR_MS: algo_cfg_->rep_min_dur_ms = (uint16_t)v; break;
    case VBT_P_REP_MAX_DUR_MS: algo_cfg_->rep_max_dur_ms = (uint16_t)v; break;

    case VBT_P_ADV_WINDOW_MIN: app_cfg_->adv_window_ms = v * 60000u; break;
    case VBT_P_SET_END_TIMEOUT_S:
      app_cfg_->set_end_timeout_ms = v * 1000u;
      break;
    case VBT_P_CALIB_MIN_MS: app_cfg_->calib_min_ms = v; break;
    case VBT_P_TRAVEL_TIMEOUT_M:
      app_cfg_->travel_timeout_ms = v * 60000u;
      break;
    default:
      return VBT_ERR_BAD_PARAM;
  }

  // Los del IMU no tienen efecto hasta que la capa de aplicacion los baja a
  // los registros del chip. El flag es lo que se lo avisa; sin esto, la app
  // mostraria un valor nuevo que el hardware todavia no esta usando.
  tuning_->dirty = true;
  return VBT_ERR_NONE;
}

vbt_error_t VbtService::onConfigWrite(const uint8_t *data, uint16_t len) {
  if (data == nullptr || len < 4) return VBT_ERR_BAD_PARAM;
  if (data[0] != VBT_SCHEMA_VERSION) return VBT_ERR_BAD_PARAM;

  const uint8_t param_id = data[1];
  const uint8_t tipo = data[2];

  // Escribir con el tipo especial de lectura es pedir el valor actual.
  if (tipo == VBT_PARAM_TYPE_READ) {
    return readParam(param_id) ? VBT_ERR_NONE : VBT_ERR_BAD_PARAM;
  }

  if (len < 8) return VBT_ERR_BAD_PARAM;
  return writeParam(param_id, tipo, data + 4);
}

}  // namespace ble
}  // namespace vbt
