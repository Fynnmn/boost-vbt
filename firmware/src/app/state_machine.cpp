#include "app/state_machine.h"

namespace vbt {
namespace app {

void StateMachine::configure(const Config &cfg) {
  cfg_ = cfg;
  reset(0);
}

void StateMachine::reset(uint32_t now_ms) {
  // Al encender arranca anunciando, no durmiendo: recien salio de la carga o
  // del reset, o sea que alguien lo acaba de tocar. Que aparezca en la app
  // sin pedir nada es lo que espera el usuario.
  state_ = State::kAdvertising;
  state_since_ms_ = now_ms;
  last_connection_ms_ = now_ms;
  last_motion_ms_ = now_ms;
  still_since_ms_ = now_ms;
  tap_armed_until_ms_ = 0;
  still_ = false;
  calibrated_ = false;
  set_ended_by_timeout_ = false;
  logger_requested_ = false;
  rep_count_ = 0;
}

bool StateMachine::enter(State s, uint32_t now_ms) {
  if (state_ == s) return false;
  state_ = s;
  state_since_ms_ = now_ms;
  return true;
}

void StateMachine::notifyStill(bool still, uint32_t now_ms) {
  if (still && !still_) still_since_ms_ = now_ms;
  still_ = still;
  if (!still) last_motion_ms_ = now_ms;
}

bool StateMachine::onEvent(Event e, uint32_t now_ms) {
  switch (e) {
    case Event::kImuFailed:
      return enter(State::kError, now_ms);

    case Event::kBatteryCritical:
      // Dormir es lo unico sensato: seguir midiendo con la bateria en el piso
      // arriesga corromper una escritura a flash a mitad de camino.
      return enter(State::kSleep, now_ms);

    case Event::kDoubleTap:
      // El unico evento que saca al sensor del modo viaje. Ver D1.
      if (state_ == State::kSleep || state_ == State::kTravel) {
        last_connection_ms_ = now_ms;  // reinicia la ventana de advertising
        return enter(State::kAdvertising, now_ms);
      }
      return false;

    case Event::kMotionValidated:
      // Movimiento fuerte, horizontal y sostenido. NO despierta en modo
      // viaje: ese es justamente el punto del modo viaje (el bolso se mueve).
      if (state_ == State::kSleep) {
        last_connection_ms_ = now_ms;
        return enter(State::kAdvertising, now_ms);
      }
      return false;

    case Event::kConnected:
      last_connection_ms_ = now_ms;
      return enter(logger_requested_ ? State::kLogger : State::kConnectedIdle,
                   now_ms);

    case Event::kDisconnected:
      last_connection_ms_ = now_ms;  // la ventana cuenta desde que se corta
      return enter(State::kAdvertising, now_ms);

    case Event::kSetStart:
      if (state_ != State::kConnectedIdle) return false;
      // Arranca calibrando, no grabando. Entre que el usuario aprieta el
      // boton y levanta la barra siempre hay unos segundos de barra apoyada:
      // ahi se mide el offset del sensor, sin pedirle nada a nadie (D3).
      calibrated_ = false;
      rep_count_ = 0;
      set_ended_by_timeout_ = false;
      still_since_ms_ = now_ms;
      last_motion_ms_ = now_ms;
      return enter(State::kCalibrating, now_ms);

    case Event::kSetStop:
      if (state_ == State::kRecording || state_ == State::kCalibrating) {
        set_ended_by_timeout_ = false;
        return enter(State::kConnectedIdle, now_ms);
      }
      return false;

    case Event::kRepDetected:
      if (state_ == State::kRecording) {
        if (rep_count_ < 255) rep_count_++;
        last_motion_ms_ = now_ms;
      }
      return false;

    case Event::kSleepCommand:
      return enter(State::kSleep, now_ms);

    case Event::kLoggerOn:
      logger_requested_ = true;
      if (state_ == State::kConnectedIdle) return enter(State::kLogger, now_ms);
      return false;

    case Event::kLoggerOff:
      logger_requested_ = false;
      if (state_ == State::kLogger) return enter(State::kConnectedIdle, now_ms);
      return false;
  }
  return false;
}

bool StateMachine::tick(uint32_t now_ms) {
  switch (state_) {
    case State::kAdvertising: {
      // Las tres ventanas de sueno (D1). Anunciar cuesta ~25 uA: barato
      // mientras el sensor este en uso, caro si queda un mes en un cajon.
      const uint32_t sin_conexion = now_ms - last_connection_ms_;
      if (sin_conexion >= cfg_.travel_timeout_ms) {
        return enter(State::kTravel, now_ms);
      }
      if (sin_conexion >= cfg_.adv_window_ms) {
        return enter(State::kSleep, now_ms);
      }
      return false;
    }

    case State::kSleep:
      // Del sueno profundo al modo viaje. En viaje el movimiento ya no
      // despierta: resuelve "se me prendio solo en el bolso".
      if (now_ms - last_connection_ms_ >= cfg_.travel_timeout_ms) {
        return enter(State::kTravel, now_ms);
      }
      return false;

    case State::kCalibrating: {
      const uint32_t en_estado = now_ms - state_since_ms_;
      if (still_ && (now_ms - still_since_ms_) >= cfg_.calib_min_ms) {
        calibrated_ = true;
        last_motion_ms_ = now_ms;
        return enter(State::kRecording, now_ms);
      }
      // Nunca se le pide al usuario que espere. Si en varios segundos no
      // hubo quietud suficiente, la serie arranca igual y queda marcada.
      // Datos con advertencia son mejores que ninguna serie (D3).
      if (en_estado >= cfg_.calib_give_up_ms) {
        calibrated_ = false;
        last_motion_ms_ = now_ms;
        return enter(State::kRecording, now_ms);
      }
      return false;
    }

    case State::kRecording:
      // La serie se cierra sola por inactividad (D4). El boton de terminar
      // sigue existiendo para el que se queda charlando con la barra.
      if (now_ms - last_motion_ms_ >= cfg_.set_end_timeout_ms) {
        set_ended_by_timeout_ = true;
        return enter(State::kConnectedIdle, now_ms);
      }
      return false;

    case State::kConnectedIdle:
    case State::kLogger:
    case State::kTravel:
    case State::kError:
      return false;
  }
  return false;
}

ImuMode StateMachine::imuMode() const {
  switch (state_) {
    case State::kSleep:
    case State::kTravel:
      // Wake-on-motion a 26 Hz cuesta ~25 uA. El detector de tap por hardware
      // necesita 416 Hz y ~300 uA, asi que NO queda armado de forma
      // permanente: se arma en rafagas de segundos cuando algo golpea al
      // sensor. Un tap siempre es movimiento, asi que no se pierde ninguno.
      return ImuMode::kWakeOnMotion;

    case State::kError:
      return ImuMode::kOff;

    case State::kAdvertising:
    case State::kConnectedIdle:
      return ImuMode::kWakeOnMotion;

    case State::kCalibrating:
    case State::kRecording:
    case State::kLogger:
      return ImuMode::kFull;
  }
  return ImuMode::kWakeOnMotion;
}

bool StateMachine::wantsAdvertising() const {
  return state_ == State::kAdvertising;
}

LedPattern StateMachine::led() const {
  // La bateria baja se superpone a cualquier estado menos el sueno: si el
  // sensor esta apagado no tiene sentido gastar en avisar.
  if (state_ == State::kSleep || state_ == State::kTravel) {
    return LedPattern::kOff;
  }
  if (state_ == State::kError) return LedPattern::kRedFastBlink;
  if (battery_pct_ < cfg_.low_battery_pct) return LedPattern::kRedSlowBlink;

  switch (state_) {
    case State::kAdvertising:   return LedPattern::kBlueBlink;
    case State::kConnectedIdle: return LedPattern::kBlueSolid;
    case State::kCalibrating:   return LedPattern::kBlueFastBlink;
    case State::kRecording:     return LedPattern::kGreen;
    case State::kLogger:        return LedPattern::kGreenBlink;
    default:                    return LedPattern::kOff;
  }
}

}  // namespace app
}  // namespace vbt
