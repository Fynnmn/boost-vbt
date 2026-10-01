// TODOS los umbrales del algoritmo, en un solo archivo.
//
// Estan juntos a proposito: cuando haya que calibrar contra el dataset real,
// se toca aca y en ningun otro lado. Y como se exponen por BLE (ver la
// characteristic Config en docs/PROTOCOL.md), se pueden cambiar desde el
// celular en el gimnasio sin recompilar.
//
// Los valores de ahora salen de fisica de press banca y de la senal
// sintetica. NINGUNO esta validado contra datos reales todavia.

#pragma once

#include <stdint.h>

namespace vbt {
namespace algo {

struct Config {
  // --- Muestreo ---
  float odr_hz = 208.0f;

  // --- Estimacion de gravedad ---
  // Un pasabajos muy lento sigue la orientacion sin comerse el movimiento de
  // la rep.
  //
  // 0,15 Hz (tau ~1 s) alcanzaba para reps normales pero fallaba justo en las
  // que mas importan: un grinder de 2,5 s tiene frecuencia ~0,2 Hz, o sea del
  // mismo orden que el filtro. El estimador seguia el movimiento, se comia
  // parte de la aceleracion real, y la rep entera se volvia invisible.
  //
  // Bajarlo a 0,05 Hz arreglaba los grinders y rompia las reps rapidas: no
  // hay un cutoff que sirva para las dos cosas.
  //
  // La solucion no es elegir un numero, es CONGELAR el estimador durante el
  // movimiento y actualizarlo solo en reposo. La gravedad se mide cuando
  // estas quieto; durante la rep se usa el ultimo valor conocido. Asi el
  // filtro nunca compite con el movimiento y el cutoff deja de ser critico.
  float gravity_cutoff_hz = 0.30f;         // en reposo: seguir rapido
  float gravity_motion_cutoff_hz = 0.15f;  // en movimiento: seguir despacio

  // --- Deteccion de reposo (ZUPT) ---
  // Un instante se considera de reposo si la aceleracion esta cerca de 1 g y
  // el giroscopio esta cerca de cero, sostenido durante zupt_min_ms.
  // En press banca sobran: la pausa en el pecho, el lockout, la barra en el rack.
  //
  // OJO CON LA TOLERANCIA. Un acelerometro no puede distinguir el reposo de
  // moverse a velocidad constante: es el principio de equivalencia. En el
  // tramo central de una excentrica lenta la aceleracion propia es casi cero
  // y el sensor mide 1 g exacto, igual que quieto.
  //
  // Con 60 mg (0,59 m/s^2) toda la excentrica de un press banca entra en la
  // banda, el ZUPT resetea la velocidad a cada rato y la rep nunca arranca.
  // 25 mg (0,25 m/s^2) deja afuera el movimiento y sigue arriba del ruido
  // del LSM6DS3TR, que ronda los 8 mg.
  // La ventana es estrecha y esta acotada por los dos lados: por arriba, el
  // movimiento lento tiene que quedar AFUERA (si no, ancla en medio de la rep
  // y la parte al medio); por abajo, el ruido del sensor y el bias tienen que
  // quedar ADENTRO (si no, nunca ancla y la velocidad deriva).
  // Barrido contra el dataset: 0,060 no detecta ninguna rep, 0,038 detecta la
  // mitad, 0,025 llega al 95%, 0,020 al 100%. Es el parametro mas sensible
  // del algoritmo y el primero a recalibrar con datos reales.
  float zupt_acc_tol_g = 0.020f;
  float zupt_gyr_tol_dps = 3.0f;
  uint16_t zupt_min_ms = 150;

  // Segundo umbral, mas exigente, para no cortar una fase por la mitad.
  // Estando DENTRO de una excentrica o una concentrica hace falta mucha mas
  // evidencia de reposo para creerle: si no, un instante de velocidad
  // constante termina la rep antes de tiempo y el ROM sale cortado.
  uint16_t zupt_in_motion_ms = 320;

  // --- Umbrales de fase ---
  // Velocidad a la que se considera que arranco un movimiento.
  float vel_start_ms = 0.12f;
  // Velocidad por debajo de la cual se considera que termino.
  float vel_end_ms = 0.06f;

  // --- Validacion de plausibilidad fisica (v2) ---
  // Lo que separa una rep de un movimiento cualquiera.
  float rep_min_rom_m = 0.15f;
  float rep_max_rom_m = 0.80f;
  // 300 ms descartaba reps explosivas legitimas: con barra liviana una
  // concentrica de banca dura 250 ms, y el recorte del post-proceso le
  // saca un poco mas. Por debajo de 200 ms ya no es una rep, es un golpe.
  uint16_t rep_min_dur_ms = 200;
  uint16_t rep_max_dur_ms = 6000;

  // Una rep cuyo ROM se aparta de la mediana de la serie es sospechosa: en
  // una serie real el recorrido es bastante consistente.
  float rom_outlier_ratio = 0.45f;

  // Rotacion promedio durante la rep por encima de la cual se marca la
  // muestra: suele significar que el sensor esta en la manga giratoria.
  float high_rotation_dps = 60.0f;

  // Techo de muestras que se guardan de una rep para el post-proceso.
  // 1300 a 208 Hz son 6,25 s, que cubre el rep_max_dur_ms con margen.
  // A 4 bytes por muestra son ~5 kB de los 256 kB de RAM del nRF52840.
  static constexpr uint16_t kMaxRepSamples = 1300;
};

}  // namespace algo
}  // namespace vbt
