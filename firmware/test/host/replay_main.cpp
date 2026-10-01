// Corre el detector de reps sobre un archivo del dataset.
//
// Este binario es la razon de ser del entorno native: contiene EXACTAMENTE el
// mismo codigo de src/algo/ que despues corre en el nRF52840. Un cambio de
// umbral se evalua en segundos contra todas las grabaciones, en vez de un
// viaje al gimnasio.
//
//   make replay ARCHIVO=dataset/raw/synth/set_medio.vbt
//   build/replay.exe dataset/raw/synth/set_medio.vbt --json

#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>

#include "algo/rep_detector.h"

using namespace vbt::algo;

namespace {

#pragma pack(push, 1)
struct DatasetHeader {
  char magic[4];
  uint16_t format_version;
  uint16_t odr_hz;
  uint8_t accel_fs_g;
  uint16_t gyro_fs_dps;
  uint8_t exercise_id;
  uint32_t sample_count;
  uint32_t t0_unix;
  uint16_t load_kg_x10;
  uint8_t origin;  // 0 = sensor real, 1 = sintetico, 2 = IMU de un telefono
  uint8_t reserved[9];
};
#pragma pack(pop)
static_assert(sizeof(DatasetHeader) == 32, "el header del dataset son 32 B");

// Un valor desconocido NO puede caer en "sensor real": es la etiqueta que
// mas confianza transmite y seria justo la mentira mas cara.
static const char *origen_nombre(uint8_t o) {
  switch (o) {
    case 0: return "sensor real";
    case 1: return "sintetico";
    case 2: return "telefono";
    default: return "origen desconocido";
  }
}

struct RawSample {
  int16_t ax, ay, az, gx, gy, gz;
};

float accelLsbMg(uint8_t fs_g) {
  switch (fs_g) {
    case 2: return 0.061f;
    case 4: return 0.122f;
    case 8: return 0.244f;
    case 16: return 0.488f;
  }
  return 0.244f;
}

float gyroLsbMdps(uint16_t fs_dps) {
  switch (fs_dps) {
    case 250: return 8.75f;
    case 500: return 17.50f;
    case 1000: return 35.0f;
    case 2000: return 70.0f;
  }
  return 35.0f;
}

}  // namespace

int main(int argc, char **argv) {
  if (argc < 2) {
    fprintf(stderr, "uso: replay <archivo.vbt> [--json] [--trace]\n");
    return 2;
  }
  const char *path = argv[1];
  bool as_json = false;
  bool trace = false;
  for (int i = 2; i < argc; ++i) {
    if (strcmp(argv[i], "--json") == 0) as_json = true;
    if (strcmp(argv[i], "--trace") == 0) trace = true;
  }

  FILE *f = fopen(path, "rb");
  if (!f) {
    fprintf(stderr, "no pude abrir %s\n", path);
    return 2;
  }

  DatasetHeader h{};
  if (fread(&h, sizeof(h), 1, f) != 1 || memcmp(h.magic, "VBT1", 4) != 0) {
    fprintf(stderr, "%s no parece un archivo .vbt\n", path);
    fclose(f);
    return 2;
  }

  std::vector<RawSample> raw(h.sample_count);
  const size_t got = fread(raw.data(), sizeof(RawSample), h.sample_count, f);
  fclose(f);
  if (got != h.sample_count) {
    fprintf(stderr, "archivo truncado: %zu de %u muestras\n", got,
            h.sample_count);
    raw.resize(got);
  }

  Config cfg;
  cfg.odr_hz = (float)h.odr_hz;

  // Overrides por variable de entorno. Permiten barrer umbrales sin
  // recompilar, que es lo que hace posible calibrar con datos reales en vez
  // de adivinar valores de a uno. Los mismos parametros se exponen por BLE
  // en el firmware (ver la characteristic Config en docs/PROTOCOL.md).
  auto envf = [](const char *name, float &dst) {
    const char *v = getenv(name);
    if (v) dst = (float)atof(v);
  };
  auto envu = [](const char *name, uint16_t &dst) {
    const char *v = getenv(name);
    if (v) dst = (uint16_t)atoi(v);
  };
  envf("VBT_GRAV_STILL", cfg.gravity_cutoff_hz);
  envf("VBT_GRAV_MOTION", cfg.gravity_motion_cutoff_hz);
  envf("VBT_ZUPT_ACC", cfg.zupt_acc_tol_g);
  envf("VBT_ZUPT_GYR", cfg.zupt_gyr_tol_dps);
  envu("VBT_ZUPT_MS", cfg.zupt_min_ms);
  envf("VBT_VEL_START", cfg.vel_start_ms);
  envf("VBT_VEL_END", cfg.vel_end_ms);
  envu("VBT_MIN_DUR", cfg.rep_min_dur_ms);
  envf("VBT_MIN_ROM", cfg.rep_min_rom_m);
  RepDetector det;
  det.configure(cfg);
  det.startSet();

  const float a_lsb = accelLsbMg(h.accel_fs_g) / 1000.0f;   // -> g
  const float g_lsb = gyroLsbMdps(h.gyro_fs_dps) / 1000.0f; // -> dps
  const float dt_ms = 1000.0f / (float)h.odr_hz;

  std::vector<RepMetrics> reps;
  bool saturado = false;

  for (size_t i = 0; i < raw.size(); ++i) {
    const RawSample &r = raw[i];
    if (abs(r.ax) >= 32767 || abs(r.ay) >= 32767 || abs(r.az) >= 32767) {
      saturado = true;
    }

    Sample s;
    s.ax = r.ax * a_lsb;
    s.ay = r.ay * a_lsb;
    s.az = r.az * a_lsb;
    s.gx = r.gx * g_lsb;
    s.gy = r.gy * g_lsb;
    s.gz = r.gz * g_lsb;

    const uint32_t t_ms = (uint32_t)(i * dt_ms);
    if (det.update(s, t_ms)) reps.push_back(det.lastRep());

    if (trace) {
      printf("%u,%d,%.4f,%.4f,%d\n", t_ms, (int)det.phase(),
             det.verticalAccel(), det.velocity(), det.isStill() ? 1 : 0);
    }
  }

  if (trace) return 0;

  if (as_json) {
    // Escapar la ruta. En Windows viene con barras invertidas, y meterla
    // cruda en un string JSON genera escapes invalidos -- o, peor, escapes
    // VALIDOS pero equivocados: "synth\nombre.vbt" parsea sin quejarse y
    // deja un salto de linea adentro de la ruta.
    std::string esc;
    for (const char *c = path; *c; ++c) {
      if (*c == '\\' || *c == '"') esc += '\\';
      esc += *c;
    }
    printf("{\n  \"archivo\": \"%s\",\n", esc.c_str());
    printf("  \"muestras\": %zu,\n  \"odr_hz\": %u,\n", raw.size(), h.odr_hz);
    if (raw.size() != h.sample_count) {
      // Marca explicita para que metrics.py pueda descartar un archivo
      // incompleto en vez de medir contra datos que faltan.
      printf("  \"truncado\": true,\n  \"muestras_declaradas\": %u,\n", h.sample_count);
    }
    // El origen viaja en el JSON para que metrics.py pueda separar los
    // conjuntos sin volver a abrir el binario.
    printf("  \"origen\": %u,\n  \"origen_nombre\": \"%s\",\n",
           h.origin, origen_nombre(h.origin));
    printf("  \"saturado\": %s,\n", saturado ? "true" : "false");
    printf("  \"reps\": [\n");
    for (size_t i = 0; i < reps.size(); ++i) {
      const RepMetrics &m = reps[i];
      printf("    {\"conc_start_ms\": %u, \"conc_end_ms\": %u, "
             "\"mean_conc_vel\": %.4f, \"mean_prop_vel\": %.4f, "
             "\"peak_vel\": %.4f, \"rom\": %.4f, \"conc_dur_ms\": %u, "
             "\"ecc_dur_ms\": %u, \"pause_ms\": %u, \"peak_vel_pos\": %u, "
             "\"quality_flags\": %u}%s\n",
             m.conc_start_ms, m.conc_end_ms, m.mean_conc_vel, m.mean_prop_vel,
             m.peak_vel, m.rom, m.conc_dur_ms, m.ecc_dur_ms, m.pause_ms,
             m.peak_vel_pos, m.quality_flags,
             i + 1 < reps.size() ? "," : "");
    }
    printf("  ],\n  \"rep_count\": %zu\n}\n", reps.size());
    return 0;
  }

  printf("%s\n", path);
  printf("  %zu muestras a %u Hz (%.1f s), %s%s\n", raw.size(), h.odr_hz,
         raw.size() / (float)h.odr_hz,
         origen_nombre(h.origin),
         saturado ? ", CON SATURACION" : "");
  if (reps.empty()) {
    printf("  sin reps detectadas\n");
    return 0;
  }

  printf("\n  %-4s %8s %8s %8s %7s %7s %6s  %s\n", "rep", "media", "prop",
         "pico", "ROM", "conc", "pausa", "flags");
  for (size_t i = 0; i < reps.size(); ++i) {
    const RepMetrics &m = reps[i];
    std::string flags;
    if (m.quality_flags & kQfSaturated) flags += "SAT ";
    if (m.quality_flags & kQfWeakZupt) flags += "ZUPT ";
    if (m.quality_flags & kQfRomOutlier) flags += "ROM ";
    if (m.quality_flags & kQfHighRotation) flags += "ROT ";
    printf("  %-4zu %6.2f m/s %6.2f %6.2f %6.0f cm %5u ms %5u  %s\n", i + 1,
           m.mean_conc_vel, m.mean_prop_vel, m.peak_vel, m.rom * 100.0f,
           m.conc_dur_ms, m.pause_ms, flags.c_str());
  }

  const float first = reps.front().mean_conc_vel;
  float best = 0.0f;
  for (const auto &m : reps) best = std::fmax(best, m.mean_conc_vel);
  const float last = reps.back().mean_conc_vel;
  printf("\n  %zu reps  |  mejor %.2f  primera %.2f  ultima %.2f  |  "
         "perdida de velocidad %.1f%%\n",
         reps.size(), best, first, last,
         best > 0.0f ? (best - last) / best * 100.0f : 0.0f);
  return 0;
}
