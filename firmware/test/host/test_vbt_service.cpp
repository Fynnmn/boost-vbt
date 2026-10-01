// Verifica el servicio BLE contra un stack falso.
//
// Prueba las tres cosas que mas rompen un protocolo en produccion:
//   - conversiones que desbordan o cambian de signo
//   - comandos basura del central (cualquiera con nRF Connect puede mandarlos)
//   - la negociacion de MTU que no salio como uno esperaba
//
// Nada de eso necesita una radio, y todo eso duele mucho descubrirlo tarde.

#include "ble/vbt_service.h"

#include <cstdio>
#include <cstring>
#include <vector>

using namespace vbt;
using namespace vbt::ble;

namespace {

int fallas = 0;
const char *caso = "";

void check(bool cond, const char *msg) {
  if (!cond) {
    printf("  FALLA  [%s] %s\n", caso, msg);
    fallas++;
  }
}

class FakeStack : public IBleStack {
 public:
  struct Envio {
    Chr chr;
    std::vector<uint8_t> data;
  };
  std::vector<Envio> notificaciones;
  std::vector<Envio> valores;
  bool connected = true;
  uint16_t mtu_ = 247;

  bool notify(Chr c, const uint8_t *data, uint16_t len) override {
    if (!connected) return false;
    // Una notificacion mas larga que el payload util se descarta entera: es
    // lo que hace el stack real, en silencio.
    if (len > usablePayload(mtu_)) return false;
    notificaciones.push_back({c, std::vector<uint8_t>(data, data + len)});
    return true;
  }

  bool setValue(Chr c, const uint8_t *data, uint16_t len) override {
    valores.push_back({c, std::vector<uint8_t>(data, data + len)});
    return true;
  }

  bool isConnected() const override { return connected; }
  uint16_t mtu() const override { return mtu_; }
  void startAdvertising() override {}
  void stopAdvertising() override {}

  const Envio *ultima(Chr c) const {
    for (auto it = notificaciones.rbegin(); it != notificaciones.rend(); ++it) {
      if (it->chr == c) return &(*it);
    }
    return nullptr;
  }
  int contar(Chr c) const {
    int n = 0;
    for (const auto &e : notificaciones) {
      if (e.chr == c) n++;
    }
    return n;
  }
};

struct Fixture {
  FakeStack stack;
  algo::Config algo_cfg;
  app::Config app_cfg;
  SensorTuning tuning;
  VbtService svc;
  Fixture() { svc.begin(stack, algo_cfg, app_cfg, tuning); }
};

algo::RepMetrics repEjemplo() {
  algo::RepMetrics m;
  m.mean_conc_vel = 0.45f;
  m.mean_prop_vel = 0.52f;
  m.peak_vel = 0.89f;
  m.rom = 0.42f;
  m.conc_dur_ms = 610;
  m.ecc_dur_ms = 1200;
  m.pause_ms = 350;
  m.peak_vel_pos = 62;
  m.quality_flags = algo::kQfWeakZupt;
  return m;
}

void test_rep_result() {
  caso = "rep result";
  Fixture f;
  check(f.svc.notifyRep(repEjemplo(), 3, 1), "notifyRep tendria que funcionar");

  const auto *e = f.stack.ultima(Chr::kRepResult);
  check(e != nullptr, "no llego la notificacion");
  if (!e) return;
  check(e->data.size() == 20, "RepResult tiene que medir 20 bytes");

  vbt_rep_result_t p;
  memcpy(&p, e->data.data(), sizeof(p));
  check(p.schema == VBT_SCHEMA_VERSION, "schema");
  check(p.rep_index == 3, "rep_index");
  check(p.mean_conc_vel == 450, "0,45 m/s tienen que ser 450 mm/s");
  check(p.rom == 420, "0,42 m tienen que ser 420 mm");
  check(p.conc_dur_ms == 610, "duracion concentrica");
  check(p.quality_flags == VBT_QF_WEAK_ZUPT, "los flags tienen que viajar");
  check(p.set_index == 1, "set_index");

  // El byte a byte: little-endian, como espera la app.
  check(e->data[2] == 0xC2 && e->data[3] == 0x01,
        "mean_conc_vel mal serializado");
}

void test_conversiones_extremas() {
  caso = "conversiones";
  Fixture f;

  // Una velocidad negativa no significa nada en una concentrica, pero puede
  // salir del algoritmo si algo va mal. Sin recortar, -0,1 m/s se convierte
  // en 65435 mm/s y la app muestra una rep a 65 m/s.
  algo::RepMetrics neg = repEjemplo();
  neg.mean_conc_vel = -0.1f;
  neg.rom = -0.5f;
  f.svc.notifyRep(neg, 1, 0);
  vbt_rep_result_t p;
  memcpy(&p, f.stack.ultima(Chr::kRepResult)->data.data(), sizeof(p));
  check(p.mean_conc_vel == 0, "una velocidad negativa tiene que dar 0, no 65435");
  check(p.rom == 0, "un ROM negativo tiene que dar 0");

  // Y por arriba tiene que saturar, no dar la vuelta.
  algo::RepMetrics enorme = repEjemplo();
  enorme.peak_vel = 1000.0f;
  enorme.peak_vel_pos = 250;
  f.svc.notifyRep(enorme, 1, 0);
  memcpy(&p, f.stack.ultima(Chr::kRepResult)->data.data(), sizeof(p));
  check(p.peak_vel == 65535, "tiene que saturar arriba, no envolver");
  check(p.peak_vel_pos <= 100, "el porcentaje no puede pasarse de 100");
}

void test_set_summary() {
  caso = "set summary";
  Fixture f;
  f.svc.startSet();

  // Una serie donde la primera rep sale mal (mal agarre) y la segunda es la
  // mejor. La perdida de velocidad tiene que calcularse contra la MEJOR, no
  // contra la primera: si no, mostraria una fatiga que no existio.
  algo::RepMetrics r = repEjemplo();
  r.mean_conc_vel = 0.40f;  // primera, floja
  f.svc.trackRep(r);
  r.mean_conc_vel = 0.60f;  // mejor
  f.svc.trackRep(r);
  r.mean_conc_vel = 0.30f;  // ultima, cansado
  f.svc.trackRep(r);

  f.svc.notifySetSummary(1, 3, VBT_EX_BENCH, 825, 45000);
  const auto *e = f.stack.ultima(Chr::kSetSummary);
  check(e != nullptr && e->data.size() == 20, "SetSummary de 20 bytes");
  if (!e) return;

  vbt_set_summary_t p;
  memcpy(&p, e->data.data(), sizeof(p));
  check(p.rep_count == 3, "cantidad de reps");
  check(p.best_mean_vel == 600, "la mejor tiene que ser 0,60 m/s");
  check(p.first_rep_vel == 400, "la primera");
  check(p.last_rep_vel == 300, "la ultima");
  check(p.load_kg_x10 == 825, "82,5 kg");
  check(p.duration_ms == 45000, "duracion");
  // (600 - 300) / 600 = 50,0%
  check(p.velocity_loss_x10 == 500,
        "la perdida se calcula contra la mejor rep, no contra la primera");
  check((p.flags & VBT_QF_WEAK_ZUPT) != 0,
        "los flags de la serie son el OR de los de las reps");
}

void test_status() {
  caso = "status";
  Fixture f;
  StatusInfo info;
  info.state = app::State::kRecording;
  info.battery_pct = 73;
  info.battery_mv = 3910;
  info.rep_count = 5;
  info.exercise_id = VBT_EX_BENCH;
  info.uptime_s = 12345;
  info.log_free_bytes = 1000000;
  info.imu_ok = true;
  info.calibrated = true;

  f.svc.notifyStatus(info);
  const auto *e = f.stack.ultima(Chr::kStatus);
  check(e != nullptr && e->data.size() == 20, "Status de 20 bytes");
  if (!e) return;

  vbt_status_t p;
  memcpy(&p, e->data.data(), sizeof(p));
  check(p.state == VBT_STATE_RECORDING, "estado");
  check(p.battery_pct == 73, "bateria");
  check(p.uptime_s == 12345, "uptime");
  check((p.flags & VBT_SF_IMU_OK) != 0, "flag de IMU ok");
  check((p.flags & VBT_SF_CALIBRATED) != 0, "flag de calibrado");
  check((p.flags & VBT_SF_CHARGING) == 0, "no estaba cargando");

  // Tiene que quedar tambien como valor legible: la app que recien se conecta
  // lee el estado sin esperar la proxima notificacion.
  bool publicado = false;
  for (const auto &v : f.stack.valores) {
    if (v.chr == Chr::kStatus) publicado = true;
  }
  check(publicado, "el Status tiene que quedar legible, no solo notificarse");
}

void test_bateria_estandar() {
  caso = "bateria";
  Fixture f;
  f.svc.notifyBattery(73);
  const auto *e = f.stack.ultima(Chr::kBatteryLevel);
  check(e != nullptr && e->data.size() == 1, "el Battery Service manda 1 byte");
  if (e) check(e->data[0] == 73, "porcentaje");

  f.svc.notifyBattery(200);
  e = f.stack.ultima(Chr::kBatteryLevel);
  if (e) check(e->data[0] == 100, "tiene que recortar a 100");
}

void test_comandos() {
  caso = "comandos";
  Fixture f;

  // SET_START con press banca a 82,5 kg.
  const uint8_t start[] = {VBT_SCHEMA_VERSION, VBT_OP_SET_START, VBT_EX_BENCH,
                           0x39, 0x03};
  Command c = f.svc.onControlWrite(start, sizeof(start));
  check(c.valid, "SET_START tendria que ser valido");
  check(c.opcode == VBT_OP_SET_START, "opcode");
  check(c.exercise_id == VBT_EX_BENCH, "ejercicio");
  check(c.load_kg_x10 == 825, "82,5 kg");

  // Comandos sin payload.
  const uint8_t stop[] = {VBT_SCHEMA_VERSION, VBT_OP_SET_STOP};
  c = f.svc.onControlWrite(stop, sizeof(stop));
  check(c.valid && c.opcode == VBT_OP_SET_STOP, "SET_STOP");

  const uint8_t logger[] = {VBT_SCHEMA_VERSION, VBT_OP_MODE_LOGGER, 1};
  c = f.svc.onControlWrite(logger, sizeof(logger));
  check(c.valid && c.enable, "MODE_LOGGER con enable");

  const uint8_t hora[] = {VBT_SCHEMA_VERSION, VBT_OP_SET_TIME,
                          0x40, 0x1F, 0x9D, 0x6A};
  c = f.svc.onControlWrite(hora, sizeof(hora));
  check(c.valid && c.unix_s == 0x6A9D1F40, "SET_TIME little-endian");
}

void test_comandos_basura() {
  caso = "comandos basura";
  // Cualquiera con nRF Connect puede escribir lo que se le ocurra en la
  // characteristic de control. El firmware NUNCA puede colgarse ni resetearse
  // por eso: tiene que ignorar y seguir.
  Fixture f;

  check(!f.svc.onControlWrite(nullptr, 0).valid, "puntero nulo");
  const uint8_t vacio[] = {VBT_SCHEMA_VERSION};
  check(!f.svc.onControlWrite(vacio, 1).valid, "comando de un solo byte");

  const uint8_t desconocido[] = {VBT_SCHEMA_VERSION, 0x7F};
  Command c = f.svc.onControlWrite(desconocido, 2);
  check(!c.valid, "un opcode desconocido no puede ser valido");
  check(c.error == VBT_ERR_BAD_OPCODE, "y tiene que reportar el error");

  const uint8_t viejo[] = {99, VBT_OP_SET_STOP};
  check(!f.svc.onControlWrite(viejo, 2).valid,
        "un esquema desconocido se ignora");

  // SET_START sin la carga: payload truncado.
  const uint8_t truncado[] = {VBT_SCHEMA_VERSION, VBT_OP_SET_START, 1};
  c = f.svc.onControlWrite(truncado, 3);
  check(!c.valid, "un payload truncado no puede aceptarse");

  // Fuzzing basico: todos los opcodes posibles, con y sin payload.
  for (int op = 0; op < 256; ++op) {
    for (int len = 2; len <= 8; ++len) {
      uint8_t buf[8] = {VBT_SCHEMA_VERSION, (uint8_t)op, 0xFF, 0xFF,
                        0xFF, 0xFF, 0xFF, 0xFF};
      f.svc.onControlWrite(buf, (uint16_t)len);  // no puede crashear
    }
  }
  check(true, "el fuzzing de comandos no tiene que crashear");
}

void test_config_por_ble() {
  caso = "config";
  // Poder cambiar umbrales desde el celular es lo que permite calibrar en el
  // gimnasio sin recompilar (DECISIONS.md).
  Fixture f;
  check(f.algo_cfg.zupt_acc_tol_g > 0.019f && f.algo_cfg.zupt_acc_tol_g < 0.021f,
        "el default tendria que ser 20 mg");

  // Escribir 30 mg.
  uint8_t w[8] = {VBT_SCHEMA_VERSION, VBT_P_ZUPT_ACC_TOL_MG,
                  VBT_PARAM_TYPE_U16, 0, 30, 0, 0, 0};
  check(f.svc.onConfigWrite(w, 8) == VBT_ERR_NONE, "escritura de parametro");
  check(f.algo_cfg.zupt_acc_tol_g > 0.029f && f.algo_cfg.zupt_acc_tol_g < 0.031f,
        "el umbral tendria que haber cambiado a 30 mg");

  // Un parametro de la app.
  uint8_t w2[8] = {VBT_SCHEMA_VERSION, VBT_P_SET_END_TIMEOUT_S,
                   VBT_PARAM_TYPE_U16, 0, 20, 0, 0, 0};
  check(f.svc.onConfigWrite(w2, 8) == VBT_ERR_NONE, "timeout de fin de serie");
  check(f.app_cfg.set_end_timeout_ms == 20000, "20 s");

  // Leer: se escribe el param_id con el tipo especial de lectura.
  uint8_t r[8] = {VBT_SCHEMA_VERSION, VBT_P_REP_MIN_DUR_MS,
                  VBT_PARAM_TYPE_READ, 0, 0, 0, 0, 0};
  check(f.svc.onConfigWrite(r, 8) == VBT_ERR_NONE, "lectura de parametro");
  bool encontrado = false;
  for (const auto &v : f.stack.valores) {
    if (v.chr == Chr::kConfig && v.data[1] == VBT_P_REP_MIN_DUR_MS) {
      uint32_t val = 0;
      memcpy(&val, v.data.data() + 4, 4);
      check(val == f.algo_cfg.rep_min_dur_ms, "el valor leido no coincide");
      encontrado = true;
    }
  }
  check(encontrado, "la lectura tendria que publicar el valor");

  // Un param_id que no existe se rechaza sin romper nada.
  uint8_t malo[8] = {VBT_SCHEMA_VERSION, 0xEE, VBT_PARAM_TYPE_U16, 0, 1, 0, 0, 0};
  check(f.svc.onConfigWrite(malo, 8) == VBT_ERR_BAD_PARAM,
        "un parametro desconocido tiene que rechazarse");
  // Y escrituras cortas tampoco.
  check(f.svc.onConfigWrite(malo, 2) == VBT_ERR_BAD_PARAM, "escritura corta");
}


// Un helper, porque todos los casos de abajo son la misma escritura con
// distinto valor y leerlos byte a byte tapaba lo que cada uno prueba.
vbt_error_t escribir(Fixture &f, uint8_t id, uint8_t tipo, uint32_t valor) {
  uint8_t w[8] = {VBT_SCHEMA_VERSION, id, tipo, 0, 0, 0, 0, 0};
  memcpy(w + 4, &valor, 4);
  return f.svc.onConfigWrite(w, 8);
}

void test_config_rangos() {
  caso = "rangos de config";
  // El sensor es el unico control real: cualquiera puede escribir bytes
  // arbitrarios en la caracteristica. Un slider en la app no protege nada.
  Fixture f;

  // 65535 mg son 65 g de tolerancia: todo pareceria quieto y el sensor no
  // volveria a contar una repeticion, sin ningun sintoma que apunte a la
  // causa. Es el caso que motiva toda la validacion.
  check(escribir(f, VBT_P_ZUPT_ACC_TOL_MG, VBT_PARAM_TYPE_U16, 65535) ==
            VBT_ERR_BAD_PARAM,
        "65535 mg de tolerancia tiene que rechazarse");
  check(f.algo_cfg.zupt_acc_tol_g < 0.021f,
        "un rechazo no puede dejar el valor a medio escribir");

  check(escribir(f, VBT_P_ZUPT_ACC_TOL_MG, VBT_PARAM_TYPE_U16, 0) ==
            VBT_ERR_BAD_PARAM, "cero tampoco");
  check(escribir(f, VBT_P_ZUPT_ACC_TOL_MG, VBT_PARAM_TYPE_U16, 60) ==
            VBT_ERR_NONE, "60 mg esta dentro de rango");

  // Los bordes exactos entran: si el limite fuera exclusivo, la app mostraria
  // un tope que el sensor rechaza.
  check(escribir(f, VBT_P_TAP_THS, VBT_PARAM_TYPE_U8, 1) == VBT_ERR_NONE,
        "el minimo de TAP_THS tiene que entrar");
  check(escribir(f, VBT_P_TAP_THS, VBT_PARAM_TYPE_U8, 31) == VBT_ERR_NONE,
        "el maximo de TAP_THS tiene que entrar");
  check(escribir(f, VBT_P_TAP_THS, VBT_PARAM_TYPE_U8, 32) == VBT_ERR_BAD_PARAM,
        "uno mas que el maximo no");

  // El tipo tiene que coincidir. Antes se ignoraba, y escribir un u8
  // declarando float reinterpretaba los bytes en silencio.
  check(escribir(f, VBT_P_TAP_THS, VBT_PARAM_TYPE_F32, 12) == VBT_ERR_BAD_PARAM,
        "tipo equivocado tiene que rechazarse");

  // Solo lectura: cambiar el ODR en caliente obliga a tirar el FIFO en medio
  // de una serie y deja invalidas las escalas ya escritas en las grabaciones.
  check(escribir(f, VBT_P_ODR_HZ, VBT_PARAM_TYPE_U16, 104) == VBT_ERR_BAD_PARAM,
        "ODR_HZ es de solo lectura");

  // Basura en los bytes altos de un tipo angosto no puede colarse por el
  // rango: 0x0100 truncado a u8 es 0, que esta fuera de rango.
  check(escribir(f, VBT_P_TAP_THS, VBT_PARAM_TYPE_U8, 0x100) ==
            VBT_ERR_BAD_PARAM, "los bytes altos de un u8 se ignoran");
}

void test_config_coherencia() {
  caso = "coherencia de config";
  // Cada valor por separado es valido; juntos dejan una ventana vacia y el
  // sensor deja de contar. Ningun rango individual lo atrapa.
  Fixture f;

  // Se estrecha la ventana primero: con los defaults (150-800 mm) ningun
  // valor legal del minimo llega a pasar al maximo.
  check(escribir(f, VBT_P_REP_MAX_ROM_MM, VBT_PARAM_TYPE_U16, 400) ==
            VBT_ERR_NONE, "bajar el ROM maximo a 400");
  check(escribir(f, VBT_P_REP_MIN_ROM_MM, VBT_PARAM_TYPE_U16, 500) ==
            VBT_ERR_BAD_PARAM,
        "un ROM minimo por encima del maximo tiene que rechazarse");
  check(f.algo_cfg.rep_min_rom_m < 0.16f, "y no tiene que haber cambiado nada");

  check(escribir(f, VBT_P_REP_MIN_DUR_MS, VBT_PARAM_TYPE_U16, 1500) ==
            VBT_ERR_NONE, "subir la duracion minima a 1500 ms");
  check(escribir(f, VBT_P_REP_MAX_DUR_MS, VBT_PARAM_TYPE_U16, 1000) ==
            VBT_ERR_BAD_PARAM,
        "una duracion maxima por debajo de la minima tampoco");
  check(f.algo_cfg.rep_max_dur_ms == 6000, "y el maximo sigue intacto");

  // Subir primero el maximo y despues el minimo si funciona: el orden que
  // usaria alguien ensanchando la ventana.
  check(escribir(f, VBT_P_REP_MAX_ROM_MM, VBT_PARAM_TYPE_U16, 1200) ==
            VBT_ERR_NONE, "volver a subir el maximo");
  check(escribir(f, VBT_P_REP_MIN_ROM_MM, VBT_PARAM_TYPE_U16, 600) ==
            VBT_ERR_NONE, "y ahora el minimo entra");
}

void test_config_tap_y_dirty() {
  caso = "tap y dirty";
  // Los cuatro del doble tap son los que ESTADO.md manda calibrar en el
  // gimnasio con la carcasa puesta. Antes ni se leian ni se escribian.
  Fixture f;
  check(!f.tuning.dirty, "recien arrancado no hay nada pendiente");

  check(escribir(f, VBT_P_TAP_THS, VBT_PARAM_TYPE_U8, 18) == VBT_ERR_NONE,
        "TAP_THS tiene que poder escribirse");
  check(f.tuning.tap_ths == 18, "el valor tiene que quedar guardado");
  check(f.tuning.dirty,
        "un cambio sin aplicar al chip tiene que marcarse pendiente");

  check(escribir(f, VBT_P_TAP_SHOCK, VBT_PARAM_TYPE_U8, 2) == VBT_ERR_NONE, "shock");
  check(escribir(f, VBT_P_TAP_QUIET, VBT_PARAM_TYPE_U8, 1) == VBT_ERR_NONE, "quiet");
  check(escribir(f, VBT_P_TAP_DUR, VBT_PARAM_TYPE_U8, 9) == VBT_ERR_NONE, "dur");
  check(f.tuning.tap_dur == 9, "DUR");

  // Y que se lea de vuelta lo que se escribio, con el tipo de la tabla.
  f.stack.valores.clear();
  uint8_t r[8] = {VBT_SCHEMA_VERSION, VBT_P_TAP_THS, VBT_PARAM_TYPE_READ,
                  0, 0, 0, 0, 0};
  check(f.svc.onConfigWrite(r, 8) == VBT_ERR_NONE, "lectura de TAP_THS");
  bool visto = false;
  for (const auto &v : f.stack.valores) {
    if (v.chr == Chr::kConfig && v.data[1] == VBT_P_TAP_THS) {
      check(v.data[2] == VBT_PARAM_TYPE_U8, "TAP_THS se publica como u8");
      uint32_t val = 0;
      memcpy(&val, v.data.data() + 4, 4);
      check(val == 18, "tiene que leerse el 18 que se escribio");
      visto = true;
    }
  }
  check(visto, "la lectura tiene que publicar el valor");
}

void test_config_tabla_completa() {
  caso = "tabla de config";
  // Que la tabla y el codigo no se separen: agregar una fila sin implementarla
  // daria un parametro que la app ofrece y el sensor rechaza, o peor, uno que
  // se lee como cero y parece un dato de verdad.
  Fixture f;
  for (unsigned i = 0; i < VBT_PARAM_COUNT; ++i) {
    const vbt_param_spec_t &sp = VBT_PARAM_SPECS[i];

    uint8_t r[8] = {VBT_SCHEMA_VERSION, sp.param_id, VBT_PARAM_TYPE_READ,
                    0, 0, 0, 0, 0};
    if (f.svc.onConfigWrite(r, 8) != VBT_ERR_NONE) {
      printf("  param 0x%02X esta en la tabla pero no se puede leer\n",
             sp.param_id);
      fallas++;
    }

    if (!sp.writable) continue;
    // El default de la tabla tiene que ser aceptable: si no, "restaurar de
    // fabrica" desde la app dejaria el sensor rechazando su propio default.
    if (escribir(f, sp.param_id, sp.param_type, sp.def) != VBT_ERR_NONE) {
      printf("  param 0x%02X rechaza su propio default (%u)\n",
             sp.param_id, (unsigned)sp.def);
      fallas++;
    }
    if (sp.def < sp.min || sp.def > sp.max) {
      printf("  param 0x%02X: el default %u esta fuera de [%u, %u]\n",
             sp.param_id, (unsigned)sp.def, (unsigned)sp.min, (unsigned)sp.max);
      fallas++;
    }
  }
}

void test_mtu_chico() {
  caso = "mtu";
  // El caso que rompe el modo debug en silencio: la negociacion de 247 no
  // salio y quedamos en el minimo de 23.
  Fixture f;
  int16_t muestras[19 * 6];
  for (int i = 0; i < 19 * 6; ++i) muestras[i] = (int16_t)i;

  // Con MTU grande entran las 19.
  f.stack.mtu_ = 247;
  check(f.svc.notifySamples(muestras, 19, 1000) == 19,
        "con MTU 247 tienen que entrar 19 muestras");

  // Con el MTU minimo entra una sola, pero TIENE que entrar. Asumir 19 y
  // mandar 236 bytes haria que el stack descarte la notificacion entera y el
  // modo debug no anduviera nunca, sin ningun mensaje de error.
  f.stack.mtu_ = 23;
  const uint8_t enviadas = f.svc.notifySamples(muestras, 19, 2000);
  check(enviadas >= 1, "con MTU 23 tiene que mandar al menos una muestra");
  check(enviadas < 19, "con MTU 23 no pueden entrar 19 muestras");
  const auto *e = f.stack.ultima(Chr::kRawStream);
  check(e != nullptr, "la notificacion con MTU chico no llego");
  if (e) {
    check(e->data.size() <= usablePayload(23),
          "el lote se paso del payload util");
  }

  // Los payloads normales tienen que seguir funcionando con MTU minimo: por
  // eso RepResult, SetSummary y Status entran en 20 bytes.
  check(f.svc.notifyRep(repEjemplo(), 1, 0),
        "RepResult tiene que funcionar aunque el MTU sea el minimo");
  StatusInfo info;
  check(f.svc.notifyStatus(info), "Status tambien");
}

void test_desconectado() {
  caso = "desconectado";
  Fixture f;
  f.stack.connected = false;
  check(!f.svc.notifyRep(repEjemplo(), 1, 0),
        "sin conexion la notificacion tiene que fallar sin romper nada");
  check(f.svc.notifySamples(nullptr, 0, 0) == 0, "lote vacio");
}

void test_secuencia_de_lotes() {
  caso = "secuencia";
  // El numero de lote sirve para que la PC detecte muestras perdidas.
  Fixture f;
  int16_t m[6] = {1, 2, 3, 4, 5, 6};
  f.svc.notifySamples(m, 1, 0);
  f.svc.notifySamples(m, 1, 100);
  f.svc.notifySamples(m, 1, 200);

  check(f.stack.contar(Chr::kRawStream) == 3, "tres lotes");
  uint16_t seqs[3];
  int i = 0;
  for (const auto &e : f.stack.notificaciones) {
    if (e.chr == Chr::kRawStream) {
      memcpy(&seqs[i++], e.data.data() + 2, 2);
    }
  }
  check(seqs[0] == 0 && seqs[1] == 1 && seqs[2] == 2,
        "el numero de lote tiene que incrementarse: sin eso no se detectan "
        "muestras perdidas");
}

}  // namespace

int main() {
  printf("Servicio BLE contra stack falso\n");

  test_rep_result();
  test_conversiones_extremas();
  test_set_summary();
  test_status();
  test_bateria_estandar();
  test_comandos();
  test_comandos_basura();
  test_config_por_ble();
  test_config_rangos();
  test_config_coherencia();
  test_config_tap_y_dirty();
  test_config_tabla_completa();
  test_mtu_chico();
  test_desconectado();
  test_secuencia_de_lotes();

  if (fallas == 0) {
    printf("OK: 15 tests, sin fallas\n");
    return 0;
  }
  printf("%d fallas\n", fallas);
  return 1;
}
