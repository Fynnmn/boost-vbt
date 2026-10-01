#include "algo/rep_detector.h"

#include <math.h>
#include <string.h>

namespace vbt {
namespace algo {

void RepDetector::configure(const Config &cfg) {
  cfg_ = cfg;
  dt_ = 1.0f / cfg_.odr_hz;
  gravity_.configure(cfg_.gravity_cutoff_hz, cfg_.gravity_motion_cutoff_hz,
                     cfg_.odr_hz);
  still_.configure(cfg_.zupt_acc_tol_g, cfg_.zupt_gyr_tol_dps,
                   cfg_.zupt_min_ms, cfg_.odr_hz);
  startSet();
  bias_ = 0.0f;
  bias_n_ = 0;
}

void RepDetector::startSet() {
  phase_ = RepPhase::kIdle;
  vel_ = 0.0f;
  rep_n_ = 0;
  rep_overflow_ = false;
  rep_saturated_ = false;
  rot_sum_ = 0.0f;
  rot_n_ = 0;
  weak_zupt_ = false;
  rep_count_ = 0;
  rom_n_ = 0;
  last_rep_ = RepMetrics{};
}

void RepDetector::enterPhase(RepPhase p, uint32_t t_ms) {
  phase_ = p;
  phase_start_ms_ = t_ms;
}

void RepDetector::onStill() {
  // El ancla. Dos cosas pasan aca y las dos importan:
  //
  // 1. La velocidad vuelve a cero. Sabemos que el objeto esta quieto, asi que
  //    cualquier velocidad acumulada es error puro.
  // 2. Se re-estima el bias del acelerometro. Si estamos quietos, toda
  //    aceleracion vertical residual es offset del sensor. Se corrige de a
  //    poco (filtro lento) para no reaccionar a un falso "quieto".
  vel_ = 0.0f;

  // El bias se estima como promedio corriente: converge rapido con las
  // primeras muestras de reposo y se estabiliza despues.
  //
  // Con un alpha fijo y chico, el bias tardaba varios segundos en converger
  // y la PRIMERA rep de cada serie se perdia siempre: un offset de 25 mg
  // integrado durante una excentrica de 1,8 s inventa 0,44 m/s, que alcanza
  // para cancelar la bajada real y que el detector no vea nada.
  //
  // El piso de 0,004 evita que despues de miles de muestras el bias quede
  // congelado y no pueda seguir la deriva termica del sensor.
  bias_n_++;
  float alpha = 1.0f / (float)bias_n_;
  if (alpha < 0.004f) alpha = 0.004f;
  bias_ += alpha * a_lin_;

  samples_since_anchor_ = 0;
}

bool RepDetector::update(const Sample &s, uint32_t t_ms) {
  // --- Orientacion -------------------------------------------------------
  // El estimador de gravedad se actualiza SOLO cuando el sensor esta quieto.
  // Durante la rep se congela y se usa el ultimo valor conocido.
  //
  // Si se lo deja correr siempre, compite con el movimiento: un pasabajos
  // suficientemente lento para no comerse un grinder de 2,5 s arruina las
  // reps rapidas, y uno rapido hace lo contrario. Congelarlo saca el problema
  // de raiz -- la gravedad se mide quieto, que es cuando se puede medir.
  const Vec3 g_vec = gravity_.update(s.ax, s.ay, s.az, still_.isStill());
  const Vec3 up = g_vec.normalized();

  // Proyeccion de la aceleracion sobre el eje vertical. Se usa la gravedad
  // filtrada como referencia de "arriba" en vez de integrar el giroscopio,
  // porque el drift del giro se come cualquier estimacion de actitud en
  // pocos segundos. En una barra, que se mantiene casi horizontal, alcanza.
  const float a_vert_g = s.ax * up.x + s.ay * up.y + s.az * up.z;

  // Restar el modulo de la gravedad estimada, no 1,0 fijo: si el sensor tiene
  // error de escala o el filtro todavia no convergio, esto lo absorbe.
  const float g_norm = g_vec.norm();
  a_lin_ = (a_vert_g - g_norm) * kGravity - bias_;

  const float acc_norm = sqrtf(s.ax * s.ax + s.ay * s.ay + s.az * s.az);
  const float gyr_norm = sqrtf(s.gx * s.gx + s.gy * s.gy + s.gz * s.gz);
  still_.update(fabsf(acc_norm - 1.0f), gyr_norm);

  // El ZUPT se aplica SOLO fuera de las fases de movimiento.
  //
  // Un acelerometro no distingue el reposo de la velocidad constante (es el
  // principio de equivalencia), asi que en el medio de una excentrica lenta
  // parece quieto aunque la barra se este moviendo. Anclar ahi resetea la
  // velocidad a mitad de camino y parte la rep en dos.
  //
  // Fuera de la rep -- barra en el rack, pausa en el pecho, lockout -- el
  // ancla es legitima y es la que mantiene el drift a raya.
  const bool in_motion = (phase_ == RepPhase::kEccentric ||
                          phase_ == RepPhase::kConcentric);
  const bool still = still_.isStill();

  // --- Integracion en vivo ----------------------------------------------
  if (still && !in_motion) {
    onStill();
  } else {
    vel_ += a_lin_ * dt_;
    samples_since_anchor_++;
  }

  // Guardar la aceleracion desde la pausa de abajo, no desde que la velocidad
  // cruza el umbral. La concentrica empieza antes de ese cruce, y ese tramo
  // inicial es ROM real: recortarlo subestima el recorrido y la velocidad.
  // Donde empieza de verdad se decide despues, en finishConcentric().
  if (phase_ == RepPhase::kBottom || phase_ == RepPhase::kConcentric) {
    if (rep_n_ < Config::kMaxRepSamples) {
      rep_accel_[rep_n_++] = a_lin_;
    } else {
      rep_overflow_ = true;
    }
    rot_sum_ += gyr_norm;
    rot_n_++;
  }

  bool rep_terminada = false;

  // --- Maquina de estados ------------------------------------------------
  // Una repeticion es un ciclo de velocidad: baja, se frena, sube, se frena.
  // Las transiciones miran cruces de la velocidad y no la quietud, porque la
  // quietud es ambigua justo en el medio de una fase lenta. La histeresis
  // entre vel_start y vel_end evita que el ruido dispare cruces de mas.
  switch (phase_) {
    case RepPhase::kIdle:
      // En press banca la rep arranca bajando. Un movimiento hacia arriba
      // desde el reposo suele ser el unrack, no una rep.
      if (vel_ < -cfg_.vel_start_ms) {
        ecc_start_ms_ = t_ms;
        enterPhase(RepPhase::kEccentric, t_ms);
      }
      break;

    case RepPhase::kEccentric:
      // La bajada termina cuando la velocidad vuelve a cerca de cero.
      if (vel_ > -cfg_.vel_end_ms) {
        ecc_dur_ms_ = (uint16_t)(t_ms - ecc_start_ms_);
        bottom_start_ms_ = t_ms;
        rep_n_ = 0;
        rep_overflow_ = false;
        rot_sum_ = 0.0f;
        rot_n_ = 0;
        enterPhase(RepPhase::kBottom, t_ms);
      } else if (t_ms - ecc_start_ms_ > cfg_.rep_max_dur_ms) {
        enterPhase(RepPhase::kIdle, t_ms);  // se colgo bajando
      }
      break;

    case RepPhase::kBottom:
      if (vel_ > cfg_.vel_start_ms) {
        pause_ms_ = (uint16_t)(t_ms - bottom_start_ms_);
        // Sin una pausa real no hubo ancla buena: la velocidad de esta rep
        // arrastra el error de la excentrica. Se marca y se sigue.
        // Sin un ancla reciente, la velocidad de esta rep arrastra el error
        // acumulado desde la ultima vez que supimos que estaba quieta.
        weak_zupt_ = samples_since_anchor_ > (uint32_t)(2.0f * cfg_.odr_hz);
        conc_start_ms_ = t_ms;
        conc_idx_ = rep_n_;
        enterPhase(RepPhase::kConcentric, t_ms);
      } else if (vel_ < -cfg_.vel_start_ms) {
        enterPhase(RepPhase::kEccentric, t_ms);  // era una pausa a mitad
      } else if (t_ms - bottom_start_ms_ > cfg_.rep_max_dur_ms) {
        enterPhase(RepPhase::kIdle, t_ms);
      }
      break;

    case RepPhase::kConcentric:
      // La subida termina cuando la barra se frena arriba.
      if (vel_ < cfg_.vel_end_ms) {
        rep_terminada = finishConcentric(t_ms);
        enterPhase(RepPhase::kLockout, t_ms);
      } else if (t_ms - conc_start_ms_ > cfg_.rep_max_dur_ms) {
        enterPhase(RepPhase::kIdle, t_ms);  // demasiado larga para ser rep
      }
      break;

    case RepPhase::kLockout:
      if (vel_ < -cfg_.vel_start_ms) {
        ecc_start_ms_ = t_ms;  // arranca la siguiente sin pasar por Idle
        enterPhase(RepPhase::kEccentric, t_ms);
      } else if (still && t_ms - phase_start_ms_ > 200) {
        enterPhase(RepPhase::kIdle, t_ms);
      }
      break;
  }

  return rep_terminada;
}

bool RepDetector::finishConcentric(uint32_t t_ms) {
  if (rep_n_ < 8) return false;

  // --- Ventana de analisis -----------------------------------------------
  // Se arranca un poco antes de que la velocidad cruzara el umbral, para no
  // perder el arranque del movimiento, pero NO desde el inicio del buffer:
  // ahi esta la pausa de abajo, que puede durar un segundo entero.
  const uint16_t margen = (uint16_t)(0.15f * cfg_.odr_hz);
  const uint16_t win0 = conc_idx_ > margen ? (uint16_t)(conc_idx_ - margen) : 0;
  const uint16_t win_n = (uint16_t)(rep_n_ - win0);
  if (win_n < 8) return false;

  // --- Integracion con correccion de drift -------------------------------
  // Sabemos dos cosas que en vivo no se sabian: donde termino la rep, y que
  // al final la barra estaba frenada. Si la velocidad integrada no vuelve a
  // cero, la diferencia es drift acumulado, y repartirla linealmente lo
  // cancela. Es el mismo truco que usa cualquier sistema inercial serio, y
  // es lo que hace que un acelerometro barato de numeros creibles en
  // ventanas cortas.
  float v_final = 0.0f;
  for (uint16_t i = win0; i < rep_n_; ++i) v_final += rep_accel_[i] * dt_;
  const float drift_per_sample = v_final / (float)win_n;

  float vel_corr[Config::kMaxRepSamples];
  float v = 0.0f;
  for (uint16_t i = win0; i < rep_n_; ++i) {
    v += rep_accel_[i] * dt_ - drift_per_sample;
    vel_corr[i] = v;
  }

  // --- Recorte de la concentrica -----------------------------------------
  // Aca se decide donde empezo y termino de verdad el movimiento. En vivo la
  // fase se dispara con un umbral de velocidad, pero la barra arranca antes y
  // frena despues de ese cruce: recortar por el umbral perdia las colas, que
  // son ROM real.
  //
  // El recorte se ancla al pico de velocidad, que es el punto inequivoco de
  // la concentrica, y se expande hacia los dos lados hasta que la velocidad
  // cae. Buscar cruces por un umbral absoluto no alcanza: el buffer arranca
  // en la pausa de abajo, y ahi el ruido cruza cualquier umbral chico y se
  // come medio segundo de "rep" que no existe.
  uint16_t peak_idx = win0;
  float peak = 0.0f;
  for (uint16_t i = win0; i < rep_n_; ++i) {
    if (vel_corr[i] > peak) {
      peak = vel_corr[i];
      peak_idx = i;
    }
  }
  if (peak < cfg_.vel_end_ms) return false;

  // Umbral relativo al pico: una rep lenta y una explosiva se recortan igual
  // de bien, cosa que un umbral fijo no logra.
  const float edge = peak * 0.08f;
  uint16_t first = peak_idx;
  uint16_t last = peak_idx;
  while (first > win0 && vel_corr[first - 1] > edge) first--;
  while (last + 1 < rep_n_ && vel_corr[last + 1] > edge) last++;
  if (last <= first + 1) return false;

  float disp = 0.0f;
  float prop_sum = 0.0f;
  uint16_t prop_n = 0;

  for (uint16_t i = first; i <= last; ++i) {
    disp += vel_corr[i] * dt_;
    // Fase propulsiva: mientras la barra todavia esta siendo empujada, o sea
    // mientras la aceleracion propia no cae por debajo de -g.
    if (rep_accel_[i] > -kGravity) {
      prop_sum += vel_corr[i];
      prop_n++;
    }
  }

  const uint16_t n_conc = (uint16_t)(last - first + 1);
  const uint16_t dur_ms = (uint16_t)(n_conc * dt_ * 1000.0f);

  RepMetrics m;
  // El inicio real puede caer antes del cruce de umbral, asi que se
  // reconstruye desde el final hacia atras.
  m.conc_end_ms = t_ms - (uint32_t)((rep_n_ - 1 - last) * dt_ * 1000.0f);
  m.conc_start_ms = m.conc_end_ms - dur_ms;
  m.conc_dur_ms = dur_ms;
  m.ecc_dur_ms = ecc_dur_ms_;
  m.pause_ms = pause_ms_;
  m.rom = disp;
  m.peak_vel = peak;
  m.peak_vel_pos = (uint8_t)(((peak_idx - first) * 100u) / n_conc);

  // La velocidad media sale del desplazamiento sobre el tiempo, no de
  // promediar velocidades instantaneas: es menos sensible al ruido.
  const float dur_s = dur_ms / 1000.0f;
  m.mean_conc_vel = dur_s > 0.0f ? disp / dur_s : 0.0f;
  m.mean_prop_vel = prop_n ? prop_sum / (float)prop_n : m.mean_conc_vel;

  if (weak_zupt_) m.quality_flags |= kQfWeakZupt;
  if (rep_saturated_ || rep_overflow_) m.quality_flags |= kQfSaturated;
  if (rot_n_ && (rot_sum_ / (float)rot_n_) > cfg_.high_rotation_dps) {
    m.quality_flags |= kQfHighRotation;
  }

  if (!validate(m)) return false;

  // --- Outlier de ROM ----------------------------------------------------
  // En una serie real el recorrido es consistente. Una rep con un ROM muy
  // distinto de la mediana suele ser un movimiento que no era una rep.
  // Se marca, no se descarta: el firmware informa y la app decide.
  const float med = medianRom();
  if (med > 0.0f && fabsf(m.rom - med) / med > cfg_.rom_outlier_ratio) {
    m.quality_flags |= kQfRomOutlier;
  }
  pushRom(m.rom);

  rep_count_++;
  last_rep_ = m;
  return true;
}

bool RepDetector::validate(RepMetrics &m) const {
  // Plausibilidad fisica. Aca mueren los falsos positivos: rerackear la
  // barra, ajustar el agarre, caminar con el sensor en la mano.
  if (m.rom < cfg_.rep_min_rom_m || m.rom > cfg_.rep_max_rom_m) return false;
  if (m.conc_dur_ms < cfg_.rep_min_dur_ms) return false;
  if (m.conc_dur_ms > cfg_.rep_max_dur_ms) return false;
  if (m.mean_conc_vel <= 0.0f) return false;
  return true;
}

void RepDetector::pushRom(float rom) {
  if (rom_n_ < kRomHistory) {
    rom_hist_[rom_n_++] = rom;
  } else {
    for (uint8_t i = 1; i < kRomHistory; ++i) rom_hist_[i - 1] = rom_hist_[i];
    rom_hist_[kRomHistory - 1] = rom;
  }
}

float RepDetector::medianRom() const {
  if (rom_n_ == 0) return 0.0f;
  float tmp[kRomHistory];
  memcpy(tmp, rom_hist_, sizeof(float) * rom_n_);
  // Insercion: con 16 elementos como maximo, no vale la pena nada mejor.
  for (uint8_t i = 1; i < rom_n_; ++i) {
    const float key = tmp[i];
    int8_t j = (int8_t)i - 1;
    while (j >= 0 && tmp[j] > key) {
      tmp[j + 1] = tmp[j];
      j--;
    }
    tmp[j + 1] = key;
  }
  return tmp[rom_n_ / 2];
}

}  // namespace algo
}  // namespace vbt
