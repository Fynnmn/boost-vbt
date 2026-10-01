// Verifica que el layout de protocol.h coincida byte a byte con
// docs/PROTOCOL.md. Los static_assert del header ya atajan los tamanos;
// esto ademas chequea los offsets y el orden little-endian, que es lo que
// realmente rompe la app cuando el compilador mete padding.
//
// Compilar:  make test        (o ver README.md)

#include "ble/protocol.h"

#include <cstddef>
#include <cstdio>
#include <cstring>

static int fallas = 0;

#define CHECK_OFF(tipo, campo, esperado)                                       \
  do {                                                                         \
    size_t real = offsetof(tipo, campo);                                       \
    if (real != (size_t)(esperado)) {                                          \
      printf("  FALLA  %-18s %-18s offset %zu, esperaba %d\n", #tipo, #campo,  \
             real, (int)(esperado));                                           \
      fallas++;                                                                \
    }                                                                          \
  } while (0)

#define CHECK(cond, msg)                                                       \
  do {                                                                         \
    if (!(cond)) {                                                             \
      printf("  FALLA  %s\n", (msg));                                          \
      fallas++;                                                                \
    }                                                                          \
  } while (0)

int main() {
  printf("Verificando protocol.h contra docs/PROTOCOL.md (schema %d)\n",
         VBT_SCHEMA_VERSION);

  // RepResult
  CHECK_OFF(vbt_rep_result_t, schema, 0);
  CHECK_OFF(vbt_rep_result_t, rep_index, 1);
  CHECK_OFF(vbt_rep_result_t, mean_conc_vel, 2);
  CHECK_OFF(vbt_rep_result_t, mean_prop_vel, 4);
  CHECK_OFF(vbt_rep_result_t, peak_vel, 6);
  CHECK_OFF(vbt_rep_result_t, rom, 8);
  CHECK_OFF(vbt_rep_result_t, conc_dur_ms, 10);
  CHECK_OFF(vbt_rep_result_t, ecc_dur_ms, 12);
  CHECK_OFF(vbt_rep_result_t, pause_ms, 14);
  CHECK_OFF(vbt_rep_result_t, quality_flags, 16);
  CHECK_OFF(vbt_rep_result_t, peak_vel_pos, 17);
  CHECK_OFF(vbt_rep_result_t, set_index, 18);

  // SetSummary
  CHECK_OFF(vbt_set_summary_t, best_mean_vel, 4);
  CHECK_OFF(vbt_set_summary_t, velocity_loss_x10, 10);
  CHECK_OFF(vbt_set_summary_t, load_kg_x10, 12);
  CHECK_OFF(vbt_set_summary_t, duration_ms, 14);
  CHECK_OFF(vbt_set_summary_t, flags, 18);

  // Status
  CHECK_OFF(vbt_status_t, battery_mv, 4);
  CHECK_OFF(vbt_status_t, uptime_s, 8);
  CHECK_OFF(vbt_status_t, log_free_bytes, 12);
  CHECK_OFF(vbt_status_t, fw_version, 16);
  CHECK_OFF(vbt_status_t, last_error, 18);

  // Batch
  CHECK_OFF(vbt_batch_header_t, count, 1);
  CHECK_OFF(vbt_batch_header_t, seq, 2);
  CHECK_OFF(vbt_batch_header_t, t0_us, 4);

  // Little-endian: el protocolo lo da por sentado en las dos puntas.
  uint16_t probe = 0x0201;
  CHECK(((uint8_t *)&probe)[0] == 0x01,
        "la maquina no es little-endian; el protocolo asume que si");

  // Serializacion: un RepResult tiene que caber en una notificacion con el
  // MTU por defecto (23 - 3 = 20 bytes).
  vbt_rep_result_t rep;
  memset(&rep, 0, sizeof(rep));
  rep.schema = VBT_SCHEMA_VERSION;
  rep.rep_index = 3;
  rep.mean_conc_vel = 450;  // 0,45 m/s
  rep.rom = 420;
  uint8_t *raw = (uint8_t *)&rep;
  CHECK(sizeof(rep) <= 20, "RepResult no entra con el MTU por defecto");
  CHECK(raw[2] == 0xC2 && raw[3] == 0x01, "mean_conc_vel mal serializado");

  // El lote tiene que aprovechar el MTU de 247 sin pasarse.
  CHECK(sizeof(vbt_batch_header_t) +
            VBT_BATCH_MAX_SAMPLES * sizeof(vbt_sample_t) <=
        VBT_BATCH_MAX_PAYLOAD,
        "el lote se pasa del payload maximo");

  if (fallas == 0) {
    printf("OK: %d muestras por lote, RepResult %d B, Status %d B\n",
           VBT_BATCH_MAX_SAMPLES, (int)sizeof(vbt_rep_result_t),
           (int)sizeof(vbt_status_t));
    return 0;
  }
  printf("%d fallas\n", fallas);
  return 1;
}
