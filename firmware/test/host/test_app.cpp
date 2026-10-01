// Tests de LED, bateria y energia.
//
// El de energia es el mas valioso: convierte el presupuesto de bateria en
// algo verificable. Un estado de reposo que se olvida encendido algo caro es
// un bug invisible -- todo funciona perfecto, y al mes alguien se queja de
// que el sensor se le muere.

#include "app/battery.h"
#include "app/led.h"
#include "app/power.h"

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

// ---------------------------------------------------------------------------
// LED
// ---------------------------------------------------------------------------

void test_led_basico() {
  caso = "led";
  LedController led;
  led.configure(255);

  check(led.update(LedPattern::kOff, 0).isOff(), "apagado tiene que ser 0,0,0");

  const LedOutput azul = led.update(LedPattern::kBlueSolid, 0);
  check(azul.b == 255 && azul.r == 0 && azul.g == 0, "azul fijo");
  check(led.update(LedPattern::kBlueSolid, 12345).b == 255,
        "el azul fijo no puede parpadear");

  const LedOutput verde = led.update(LedPattern::kGreen, 999);
  check(verde.g == 255 && verde.b == 0, "verde grabando");
}

void test_led_brillo() {
  caso = "led brillo";
  LedController led;
  led.configure(40);  // el default
  const LedOutput o = led.update(LedPattern::kBlueSolid, 0);
  check(o.b == 40, "el brillo tiene que escalar el color");

  led.configure(0);
  check(led.update(LedPattern::kBlueSolid, 0).isOff(),
        "brillo 0 tiene que apagar todo");
}

void test_led_parpadeo() {
  caso = "led parpadeo";
  LedController led;
  led.configure(255);

  // Al principio del periodo esta encendido, despues apagado.
  check(!led.update(LedPattern::kBlueBlink, 0).isOff(),
        "el parpadeo tiene que arrancar encendido");
  check(led.update(LedPattern::kBlueBlink, 500).isOff(),
        "a mitad de periodo tiene que estar apagado");
  check(!led.update(LedPattern::kBlueBlink, 1000).isOff(),
        "al periodo siguiente tiene que volver a encender");

  // Ciclo de trabajo corto: un LED encendido el 10% del tiempo consume la
  // decima parte y se ve igual de bien.
  int encendidas = 0;
  for (uint32_t t = 0; t < LedController::kBlinkPeriodMs; t += 10) {
    if (!led.update(LedPattern::kBlueBlink, t).isOff()) encendidas++;
  }
  const int pct = encendidas * 100 / (int)(LedController::kBlinkPeriodMs / 10);
  check(pct > 5 && pct < 20, "el ciclo de trabajo del parpadeo se fue de rango");

  // El aviso de bateria baja tiene que ser el mas barato de todos: es
  // justamente el momento en que menos bateria queda.
  int bajas = 0;
  for (uint32_t t = 0; t < LedController::kSlowBlinkPeriodMs; t += 10) {
    if (!led.update(LedPattern::kRedSlowBlink, t).isOff()) bajas++;
  }
  const int pct_baja = bajas * 100 / (int)(LedController::kSlowBlinkPeriodMs / 10);
  check(pct_baja <= pct,
        "el aviso de bateria baja no puede consumir mas que el parpadeo normal");
}

// ---------------------------------------------------------------------------
// Bateria
// ---------------------------------------------------------------------------

void test_bateria_curva() {
  caso = "bateria curva";
  check(BatteryMonitor::millivoltsToPercent(4200) == 100, "4,20 V = 100%");
  check(BatteryMonitor::millivoltsToPercent(4300) == 100, "por encima, tope 100");
  check(BatteryMonitor::millivoltsToPercent(3400) == 0, "3,40 V = 0%");
  check(BatteryMonitor::millivoltsToPercent(3000) == 0, "por debajo, piso 0");

  const uint8_t p37 = BatteryMonitor::millivoltsToPercent(3700);
  check(p37 >= 10 && p37 <= 20, "3,70 V tendria que estar cerca del 15%");

  // La curva NO es lineal, y esa es la razon de usar tabla. Si fuera lineal
  // entre 4,2 y 3,4, a 3,8 V daria 50%. En una LiPo real a 3,8 V queda ~40%,
  // y a 3,7 V queda ~15%, no 37%.
  const uint8_t p38 = BatteryMonitor::millivoltsToPercent(3800);
  check(p38 >= 35 && p38 <= 45, "3,80 V tendria que estar cerca del 40%");
  check(p38 - p37 > 15,
        "entre 3,70 y 3,80 V tiene que haber una caida fuerte: la curva no es lineal");

  // Monotonia: mas tension nunca puede dar menos porcentaje.
  uint8_t anterior = 0;
  for (uint16_t mv = 3400; mv <= 4200; mv += 10) {
    const uint8_t p = BatteryMonitor::millivoltsToPercent(mv);
    check(p >= anterior, "la curva de bateria no es monotona");
    anterior = p;
  }
}

void test_bateria_histeresis() {
  caso = "bateria histeresis";
  BatteryMonitor bat;
  bat.configure(2);

  bat.update(3900);
  const uint8_t inicial = bat.percent();
  check(inicial > 60 && inicial < 75, "3,90 V tendria que dar ~65%");

  // Ruido del ADC: el porcentaje no puede bailar.
  bat.update(3902);
  check(bat.percent() == inicial, "un cambio chico no puede mover el numero");
  bat.update(3898);
  check(bat.percent() == inicial, "tampoco para el otro lado");

  // Descargando de verdad, si baja.
  bat.update(3800);
  check(bat.percent() < inicial, "una caida real tiene que reflejarse");

  // Y descargando el numero NUNCA sube: ver a la bateria "recuperarse" sola
  // hace que el usuario deje de creerle al indicador.
  const uint8_t bajo = bat.percent();
  bat.update(3900);
  check(bat.percent() == bajo,
        "descargando, el porcentaje no puede subir");

  // Cargando si.
  bat.setCharging(true);
  bat.update(4100);
  check(bat.percent() > bajo, "cargando, el porcentaje tiene que subir");
}

void test_bateria_critica() {
  caso = "bateria critica";
  BatteryMonitor bat;
  bat.configure();
  bat.update(3800);
  check(!bat.isCritical(), "3,80 V no es critico");
  bat.update(3350);
  check(bat.isCritical(), "3,35 V tiene que ser critico");
}

// ---------------------------------------------------------------------------
// Energia
// ---------------------------------------------------------------------------

void test_energia_reposo() {
  caso = "energia reposo";
  // El test que atrapa el bug invisible: un estado de reposo que se olvida
  // algo caro encendido.
  const State reposo[] = {State::kSleep, State::kTravel};
  for (State s : reposo) {
    const PowerPlan p = planFor(s);
    check(p.imu == ImuMode::kWakeOnMotion,
          "un estado de reposo tiene que dejar el IMU en bajo consumo");
    check(p.flash_deep_power_down,
          "la flash sin deep power-down se come 450 uA: mata la autonomia");
    check(!p.radio_connected && !p.radio_advertising,
          "en reposo la radio va apagada");
    check(p.mcu_can_sleep, "en reposo el MCU tiene que poder dormir");

    const uint32_t uA = p.estimateMicroamps();
    check(uA < 50, "el reposo se fue de presupuesto (mas de 50 uA)");
  }
}

void test_energia_advertising() {
  caso = "energia advertising";
  // Anunciar es lo que permite que el usuario nunca toque el sensor (D1).
  // Tiene que costar poco o la decision no se sostiene.
  const PowerPlan p = planFor(State::kAdvertising);
  check(p.radio_advertising, "tendria que estar anunciando");
  check(p.imu == ImuMode::kWakeOnMotion,
        "anunciando no hace falta el IMU a full");
  check(p.flash_deep_power_down, "la flash va dormida mientras anuncia");

  const uint32_t uA = p.estimateMicroamps();
  check(uA < 80, "anunciar se fue de presupuesto");

  const uint32_t horas = hoursOn(uA, 350);
  check(horas > 6000,
        "anunciando 24/7 tendria que durar mas de 8 meses con 350 mAh");
  printf("  (anunciando: %u uA -> %u horas = %u dias con 350 mAh)\n", uA, horas,
         horas / 24);
}

void test_energia_ningun_estado_con_tap_armado() {
  caso = "energia tap";
  // El detector de tap por hardware cuesta 300 uA, doce veces mas que la
  // vigilancia normal. Ningun estado puede dejarlo armado de forma
  // permanente: se arma en rafagas de segundos y nada mas.
  const State todos[] = {State::kSleep,     State::kAdvertising,
                         State::kConnectedIdle, State::kRecording,
                         State::kLogger,    State::kTravel,
                         State::kError,     State::kCalibrating};
  for (State s : todos) {
    check(planFor(s).imu != ImuMode::kTapArmed,
          "algun estado dejo el detector de tap armado de forma permanente");
  }
}

void test_energia_uso_real() {
  caso = "energia uso real";
  // Alguien que entrena una hora por dia. Es el caso que importa.
  const uint32_t dias = realisticDays(350, 60);
  check(dias > 20, "con una hora diaria tendria que durar mas de 20 dias");
  printf("  (1 h/dia de entrenamiento: %u dias con 350 mAh)\n", dias);

  const uint32_t uA_grabando = planFor(State::kRecording).estimateMicroamps();
  const uint32_t horas_seguidas = hoursOn(uA_grabando, 350);
  check(horas_seguidas > 60,
        "grabando sin parar tendria que aguantar mas de 60 h teoricas");
  printf("  (grabando sin parar: %u uA -> %u h teoricas, ~%u h reales)\n",
         uA_grabando, horas_seguidas, horas_seguidas / 3);

  // El logger es el modo mas caro y es el que se usa para juntar el dataset:
  // conviene saber cuanto aguanta una sesion de captura.
  const uint32_t uA_logger = planFor(State::kLogger, true).estimateMicroamps();
  check(uA_logger > uA_grabando, "el logger tiene que consumir mas que grabar");
  printf("  (logger: %u uA -> %u h)\n", uA_logger, hoursOn(uA_logger, 350));
}

void test_energia_error_avisa() {
  caso = "energia error";
  // En error hay que poder avisar por BLE que paso, en vez de quedarse mudo.
  const PowerPlan p = planFor(State::kError);
  check(p.radio_advertising, "en error tiene que seguir anunciando para avisar");
  check(p.imu == ImuMode::kOff, "en error no tiene sentido gastar en el IMU");
}

}  // namespace

int main() {
  printf("LED, bateria y energia\n");

  test_led_basico();
  test_led_brillo();
  test_led_parpadeo();
  test_bateria_curva();
  test_bateria_histeresis();
  test_bateria_critica();
  test_energia_reposo();
  test_energia_advertising();
  test_energia_ningun_estado_con_tap_armado();
  test_energia_uso_real();
  test_energia_error_avisa();

  if (fallas == 0) {
    printf("OK: 11 tests, sin fallas\n");
    return 0;
  }
  printf("%d fallas\n", fallas);
  return 1;
}
