// Verifica el flujo de uso completo del sensor sin tener la placa.
//
// El test mas util del proyecto hasta ahora: prueba cosas que de otro modo
// solo se descubririan en septiembre con el sensor en la mano, y algunas que
// solo se descubririan despues de un viaje en avion.

#include "app/state_machine.h"
#include "ble/protocol.h"

#include <cstdio>

using namespace vbt::app;

namespace {

int fallas = 0;
const char *caso = "";

void check(bool cond, const char *msg) {
  if (!cond) {
    printf("  FALLA  [%s] %s\n", caso, msg);
    fallas++;
  }
}

constexpr uint32_t kSeg = 1000;
constexpr uint32_t kMin = 60 * kSeg;
constexpr uint32_t kHora = 60 * kMin;

// Avanza el tiempo llamando a tick() como lo haria el firmware.
uint32_t correr(StateMachine &sm, uint32_t desde, uint32_t duracion,
                uint32_t paso = 100) {
  uint32_t t = desde;
  const uint32_t fin = desde + duracion;
  while (t < fin) {
    t += paso;
    sm.tick(t);
  }
  return t;
}

void test_enums_sincronizados() {
  caso = "enums";
  // app/ y ble/ definen los estados por separado a proposito (app no incluye
  // el header de BLE). Si se desincronizan, la app muestra un estado y el
  // sensor esta en otro, y nadie se entera.
  check((uint8_t)State::kSleep == VBT_STATE_SLEEP, "kSleep");
  check((uint8_t)State::kAdvertising == VBT_STATE_ADVERTISING, "kAdvertising");
  check((uint8_t)State::kConnectedIdle == VBT_STATE_CONNECTED_IDLE, "kConnectedIdle");
  check((uint8_t)State::kRecording == VBT_STATE_RECORDING, "kRecording");
  check((uint8_t)State::kLogger == VBT_STATE_LOGGER, "kLogger");
  check((uint8_t)State::kTravel == VBT_STATE_TRAVEL, "kTravel");
  check((uint8_t)State::kError == VBT_STATE_ERROR, "kError");
}

void test_flujo_normal() {
  caso = "flujo normal";
  // El recorrido completo del usuario, tal como quedo en DECISIONS.md D1.
  StateMachine sm;
  sm.configure(Config{});
  uint32_t t = 0;
  sm.reset(t);

  // Enciende anunciando: la app lo encuentra sin que el usuario toque nada.
  check(sm.state() == State::kAdvertising, "al encender tiene que anunciar");
  check(sm.wantsAdvertising(), "deberia querer anunciar");

  sm.onEvent(Event::kConnected, t);
  check(sm.state() == State::kConnectedIdle, "conectado");
  check(sm.led() == LedPattern::kBlueSolid, "azul fijo al conectar");
  check(!sm.wantsAdvertising(), "conectado no necesita seguir anunciando");

  // El usuario aprieta empezar. NO arranca grabando: primero se calibra.
  sm.onEvent(Event::kSetStart, t);
  check(sm.state() == State::kCalibrating, "empezar tiene que calibrar primero");
  check(sm.imuMode() == ImuMode::kFull, "calibrando necesita el IMU completo");

  // El usuario apoya el sensor y se acomoda: la barra queda quieta.
  sm.notifyStill(true, t);
  t = correr(sm, t, 1500);
  check(sm.state() == State::kRecording, "tendria que haber pasado a grabar");
  check(sm.calibrated(), "la calibracion tendria que estar completa");
  check(sm.led() == LedPattern::kGreen, "verde grabando");

  // Hace 8 repeticiones.
  for (int i = 0; i < 8; ++i) {
    t += 3 * kSeg;
    sm.notifyMotion(t);
    sm.onEvent(Event::kRepDetected, t);
    sm.tick(t);
  }
  check(sm.repCount() == 8, "tendria que haber contado 8 reps");
  check(sm.state() == State::kRecording, "sigue grabando mientras hay reps");

  // Apoya la barra. A los 15 s la serie se cierra sola.
  t = correr(sm, t, 10 * kSeg);
  check(sm.state() == State::kRecording, "a los 10 s todavia no cierra");
  t = correr(sm, t, 6 * kSeg);
  check(sm.state() == State::kConnectedIdle, "a los 15 s tendria que cerrar");
  check(sm.lastSetEndedByTimeout(), "tendria que quedar marcado que cerro sola");
}

void test_calibracion_incompleta() {
  caso = "calibracion incompleta";
  // El usuario apreta empezar con la barra ya en la mano y nunca la apoya.
  // La serie tiene que arrancar IGUAL, marcada. Datos con advertencia son
  // mejores que ninguna serie (D3).
  StateMachine sm;
  sm.configure(Config{});
  uint32_t t = 0;
  sm.reset(t);
  sm.onEvent(Event::kConnected, t);
  sm.onEvent(Event::kSetStart, t);

  sm.notifyStill(false, t);  // nunca se queda quieto
  t = correr(sm, t, 4 * kSeg);
  check(sm.state() == State::kCalibrating, "a los 4 s sigue intentando calibrar");

  t = correr(sm, t, 5 * kSeg);
  check(sm.state() == State::kRecording,
        "tendria que arrancar igual sin calibrar, no quedarse trabado");
  check(!sm.calibrated(),
        "tiene que quedar marcado que la serie arranco sin calibrar");
}

void test_ventanas_de_sueno() {
  caso = "ventanas de sueno";
  StateMachine sm;
  sm.configure(Config{});
  uint32_t t = 0;
  sm.reset(t);

  // Dentro de las 24 h sigue anunciando: el usuario entrena todos los dias y
  // nunca deberia tener que tocar el sensor.
  t = correr(sm, t, 23 * kHora, 5 * kMin);
  check(sm.state() == State::kAdvertising,
        "a las 23 h todavia tendria que estar anunciando");

  // Pasadas las 24 h se duerme en serio.
  t = correr(sm, t, 2 * kHora, 5 * kMin);
  check(sm.state() == State::kSleep, "a las 25 h tendria que dormir");
  check(sm.imuMode() == ImuMode::kWakeOnMotion,
        "durmiendo, el IMU va en bajo consumo");
  check(sm.led() == LedPattern::kOff, "durmiendo el LED va apagado");

  // A los 7 dias pasa a modo viaje.
  t = correr(sm, t, 7 * 24 * kHora, kHora);
  check(sm.state() == State::kTravel, "a los 7 dias tendria que estar en viaje");
}

void test_modo_viaje() {
  caso = "modo viaje";
  // El caso que motivo todo el diseno: el sensor en el bolso, en un avion.
  StateMachine sm;
  sm.configure(Config{});
  uint32_t t = 0;
  sm.reset(t);
  t = correr(sm, t, 8 * 24 * kHora, kHora);
  check(sm.state() == State::kTravel, "tendria que estar en modo viaje");

  // El bolso se mueve todo el viaje. No puede despertarse.
  for (int i = 0; i < 50; ++i) {
    t += kMin;
    sm.onEvent(Event::kMotionValidated, t);
    sm.tick(t);
  }
  check(sm.state() == State::kTravel,
        "el movimiento NO puede despertarlo en modo viaje: para eso existe");

  // El doble toque si.
  sm.onEvent(Event::kDoubleTap, t);
  check(sm.state() == State::kAdvertising,
        "el doble toque tiene que sacarlo del modo viaje");

  // Y despues de despertar, la ventana de 24 h arranca de nuevo.
  t = correr(sm, t, 23 * kHora, 5 * kMin);
  check(sm.state() == State::kAdvertising,
        "despues de despertar tendria que anunciar otras 24 h");
}

void test_sueno_profundo_despierta_por_movimiento() {
  caso = "sueno profundo";
  StateMachine sm;
  sm.configure(Config{});
  uint32_t t = 0;
  sm.reset(t);
  t = correr(sm, t, 25 * kHora, 5 * kMin);
  check(sm.state() == State::kSleep, "tendria que estar dormido");

  // En sueno profundo (no viaje) el movimiento validado si despierta: es el
  // caso de agarrar el sensor para ponerlo en la barra.
  sm.onEvent(Event::kMotionValidated, t);
  check(sm.state() == State::kAdvertising,
        "en sueno profundo el movimiento validado tiene que despertarlo");
}

void test_desconexion() {
  caso = "desconexion";
  StateMachine sm;
  sm.configure(Config{});
  uint32_t t = 0;
  sm.reset(t);
  sm.onEvent(Event::kConnected, t);
  sm.onEvent(Event::kSetStart, t);
  sm.notifyStill(true, t);
  t = correr(sm, t, 1500);
  check(sm.state() == State::kRecording, "grabando antes de desconectar");

  // Se va el celular a mitad de la serie.
  sm.onEvent(Event::kDisconnected, t);
  check(sm.state() == State::kAdvertising,
        "al desconectar tiene que volver a anunciar para reconectar rapido");

  // Y la ventana de 24 h cuenta desde la desconexion, no desde la conexion:
  // si no, un sensor que estuvo conectado 20 h se dormiria a las 4 h de
  // haberse desconectado.
  t = correr(sm, t, 23 * kHora, 5 * kMin);
  check(sm.state() == State::kAdvertising,
        "la ventana tiene que contar desde que se corto la conexion");
}

void test_terminar_manual() {
  caso = "terminar manual";
  StateMachine sm;
  sm.configure(Config{});
  uint32_t t = 0;
  sm.reset(t);
  sm.onEvent(Event::kConnected, t);
  sm.onEvent(Event::kSetStart, t);
  sm.notifyStill(true, t);
  t = correr(sm, t, 1500);

  t += 2 * kSeg;
  sm.notifyMotion(t);
  sm.onEvent(Event::kSetStop, t);
  check(sm.state() == State::kConnectedIdle, "terminar manual tiene que cerrar");
  check(!sm.lastSetEndedByTimeout(),
        "cerrada a mano no puede figurar como cerrada por timeout");
}

void test_bateria_y_errores() {
  caso = "bateria y errores";
  StateMachine sm;
  sm.configure(Config{});
  uint32_t t = 0;
  sm.reset(t);
  sm.onEvent(Event::kConnected, t);

  sm.setBattery(10);
  check(sm.led() == LedPattern::kRedSlowBlink,
        "con bateria baja el aviso se superpone al estado");

  sm.setBattery(80);
  check(sm.led() == LedPattern::kBlueSolid, "con bateria ok vuelve al azul");

  // El IMU deja de responder: hay que avisar, no seguir dando numeros.
  sm.onEvent(Event::kImuFailed, t);
  check(sm.state() == State::kError, "IMU caido tiene que ir a error");
  check(sm.led() == LedPattern::kRedFastBlink, "rojo rapido en error");
  check(sm.imuMode() == ImuMode::kOff, "en error no tiene sentido medir");

  // Bateria critica: dormir antes de arriesgar una escritura a flash a medio
  // hacer, que corromperia la sesion que se esta grabando.
  StateMachine sm2;
  sm2.configure(Config{});
  sm2.reset(0);
  sm2.onEvent(Event::kConnected, 0);
  sm2.onEvent(Event::kBatteryCritical, 0);
  check(sm2.state() == State::kSleep, "bateria critica tiene que dormir");
}

void test_logger() {
  caso = "logger";
  StateMachine sm;
  sm.configure(Config{});
  uint32_t t = 0;
  sm.reset(t);
  sm.onEvent(Event::kConnected, t);

  sm.onEvent(Event::kLoggerOn, t);
  check(sm.state() == State::kLogger, "tendria que entrar en modo logger");
  check(sm.imuMode() == ImuMode::kFull, "el logger necesita el IMU completo");
  check(sm.led() == LedPattern::kGreenBlink, "verde parpadeando en logger");

  // Si se desconecta y vuelve, tiene que seguir en logger: la sesion de
  // captura de dataset no puede cortarse porque el celular se alejo.
  sm.onEvent(Event::kDisconnected, t);
  sm.onEvent(Event::kConnected, t);
  check(sm.state() == State::kLogger,
        "el modo logger tiene que sobrevivir a una reconexion");

  sm.onEvent(Event::kLoggerOff, t);
  check(sm.state() == State::kConnectedIdle, "salir del logger");
}

void test_consumo_por_estado() {
  caso = "consumo";
  // El IMU a 416 Hz (tap armado) consume ~300 uA: doce veces mas que el
  // wake-on-motion. Si algun estado de reposo lo dejara armado de forma
  // permanente, la autonomia pasaria de un ano a un mes.
  StateMachine sm;
  sm.configure(Config{});
  sm.reset(0);
  const State reposo[] = {State::kSleep, State::kTravel};
  for (State s : reposo) {
    StateMachine x;
    x.configure(Config{});
    x.reset(0);
    // Forzar el estado por el camino natural.
    uint32_t t = 0;
    t = correr(x, t, s == State::kTravel ? 8 * 24 * kHora : 25 * kHora, kHora);
    if (s == State::kSleep && x.state() != State::kSleep) continue;
    check(x.imuMode() != ImuMode::kTapArmed,
          "un estado de reposo dejo el detector de tap armado: se come la bateria");
    check(x.imuMode() != ImuMode::kFull,
          "un estado de reposo dejo el IMU a full");
  }
}

}  // namespace

int main() {
  printf("Maquina de estados del sensor\n");

  test_enums_sincronizados();
  test_flujo_normal();
  test_calibracion_incompleta();
  test_ventanas_de_sueno();
  test_modo_viaje();
  test_sueno_profundo_despierta_por_movimiento();
  test_desconexion();
  test_terminar_manual();
  test_bateria_y_errores();
  test_logger();
  test_consumo_por_estado();

  if (fallas == 0) {
    printf("OK: 11 tests, sin fallas\n");
    return 0;
  }
  printf("%d fallas\n", fallas);
  return 1;
}
