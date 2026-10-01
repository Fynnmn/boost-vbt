#include "algo/filters.h"

#include <math.h>

namespace vbt {
namespace algo {

void LowPass::configure(float cutoff_hz, float sample_rate_hz) {
  if (cutoff_hz <= 0.0f || sample_rate_hz <= 0.0f) {
    alpha_ = 1.0f;
    return;
  }
  const float dt = 1.0f / sample_rate_hz;
  const float rc = 1.0f / (2.0f * 3.14159265358979f * cutoff_hz);
  alpha_ = dt / (rc + dt);
  initialized_ = false;
}

void LowPass::reset(float value) {
  y_ = value;
  initialized_ = false;
}

float LowPass::update(float x) {
  if (!initialized_) {
    // Arrancar en cero haria que el filtro tarde varios segundos en alcanzar
    // la gravedad, y durante ese tiempo el detector veria una aceleracion
    // vertical enorme que no existe. Se arranca en la primera muestra.
    y_ = x;
    initialized_ = true;
    return y_;
  }
  y_ += alpha_ * (x - y_);
  return y_;
}

float Vec3::norm() const { return sqrtf(x * x + y * y + z * z); }

Vec3 Vec3::normalized() const {
  const float n = norm();
  if (n < 1e-6f) return {0.0f, 0.0f, 1.0f};
  return {x / n, y / n, z / n};
}

static float alphaFor(float cutoff_hz, float sample_rate_hz) {
  if (cutoff_hz <= 0.0f || sample_rate_hz <= 0.0f) return 1.0f;
  const float dt = 1.0f / sample_rate_hz;
  const float rc = 1.0f / (2.0f * 3.14159265358979f * cutoff_hz);
  return dt / (rc + dt);
}

void GravityEstimator::configure(float cutoff_still_hz, float cutoff_motion_hz,
                                 float sample_rate_hz) {
  alpha_still_ = alphaFor(cutoff_still_hz, sample_rate_hz);
  alpha_motion_ = alphaFor(cutoff_motion_hz, sample_rate_hz);
  lx_.configure(cutoff_still_hz, sample_rate_hz);
  ly_.configure(cutoff_still_hz, sample_rate_hz);
  lz_.configure(cutoff_still_hz, sample_rate_hz);
}

void GravityEstimator::reset() {
  lx_.reset();
  ly_.reset();
  lz_.reset();
}

Vec3 GravityEstimator::update(float ax, float ay, float az, bool still) {
  const float a = still ? alpha_still_ : alpha_motion_;
  lx_.setAlpha(a);
  ly_.setAlpha(a);
  lz_.setAlpha(a);
  return {lx_.update(ax), ly_.update(ay), lz_.update(az)};
}

void StillnessDetector::configure(float acc_tol_g, float gyr_tol_dps,
                                  uint16_t min_ms, float sample_rate_hz) {
  acc_tol_ = acc_tol_g;
  gyr_tol_ = gyr_tol_dps;
  min_samples_ = (uint16_t)(min_ms * sample_rate_hz / 1000.0f);
  if (min_samples_ == 0) min_samples_ = 1;
  reset();
}

void StillnessDetector::reset() {
  count_ = 0;
  still_ = false;
}

bool StillnessDetector::update(float accel_dev, float gyro_norm) {
  // Quieto = el acelerometro mide practicamente solo gravedad y el
  // giroscopio no ve rotacion. Las dos condiciones juntas, porque cada una
  // sola tiene un agujero: en caida libre el acelerometro marca cero y
  // parece quieto, y una rotacion pura no cambia el modulo de la aceleracion.
  const bool dentro = (accel_dev < acc_tol_) && (gyro_norm < gyr_tol_);

  if (dentro) {
    if (count_ < 0xFFFF) count_++;
  } else {
    count_ = 0;
  }

  still_ = count_ >= min_samples_;
  return still_;
}

}  // namespace algo
}  // namespace vbt
