"""Parser espejo de src/ble/protocol.h.

Si este archivo y protocol.h se desincronizan, la app y las herramientas
empiezan a leer basura sin dar error. Por eso los formatos de struct estan
todos juntos aca arriba y hay un autotest al final que verifica tamanos y
offsets contra lo que dice docs/PROTOCOL.md.

Correr:  python tools/decode.py
"""

import struct
from dataclasses import dataclass
from enum import IntEnum

SCHEMA_VERSION = 1

# Escalas del IMU. Los datos viajan crudos y se convierten aca, no en el micro.
ACCEL_LSB_MG = 0.244  # fondo de escala +-8 g
GYRO_LSB_MDPS = 35.0  # fondo de escala +-1000 dps
SAMPLE_SATURATED = 32767

# Formatos little-endian, espejo de los structs packed de protocol.h.
FMT_REP_RESULT = "<BB7H4B"
FMT_SET_SUMMARY = "<4B5HI2B"
FMT_STATUS = "<4BH2B2IH2B"
FMT_CONFIG = "<4B4s"
FMT_SAMPLE = "<6h"
FMT_BATCH_HEADER = "<BBHI"

BATCH_MAX_PAYLOAD = 244
BATCH_MAX_SAMPLES = (BATCH_MAX_PAYLOAD - struct.calcsize(FMT_BATCH_HEADER)) // struct.calcsize(FMT_SAMPLE)

UUID_SERVICE = "7d4e1a00-9b3f-4c62-a5d8-6e1f2c3b4a59"
UUID_REP_RESULT = "7d4e1a01-9b3f-4c62-a5d8-6e1f2c3b4a59"
UUID_SET_SUMMARY = "7d4e1a02-9b3f-4c62-a5d8-6e1f2c3b4a59"
UUID_CONTROL = "7d4e1a03-9b3f-4c62-a5d8-6e1f2c3b4a59"
UUID_CONFIG = "7d4e1a04-9b3f-4c62-a5d8-6e1f2c3b4a59"
UUID_STATUS = "7d4e1a05-9b3f-4c62-a5d8-6e1f2c3b4a59"
UUID_RAW_STREAM = "7d4e1a06-9b3f-4c62-a5d8-6e1f2c3b4a59"
UUID_LOG_DUMP = "7d4e1a07-9b3f-4c62-a5d8-6e1f2c3b4a59"


class State(IntEnum):
    SLEEP = 0
    ADVERTISING = 1
    CONNECTED_IDLE = 2
    RECORDING = 3
    LOGGER = 4
    TRAVEL = 5
    ERROR = 6
    CALIBRATING = 7


class Exercise(IntEnum):
    UNKNOWN = 0
    BENCH = 1
    SQUAT = 2
    DEADLIFT = 3
    OHP = 4
    ROW = 5
    HIPTHRUST = 6


class Opcode(IntEnum):
    SET_START = 0x01
    SET_STOP = 0x02
    SLEEP = 0x03
    MODE_LOGGER = 0x04
    MODE_RAWSTREAM = 0x05
    SET_TIME = 0x06
    LOG_ERASE = 0x07
    LOG_DUMP = 0x08
    CALIB_ODR = 0x09
    FACTORY_RESET = 0x0A


QF_SATURATED = 1 << 0
QF_WEAK_ZUPT = 1 << 1
QF_ROM_OUTLIER = 1 << 2
QF_HIGH_ROTATION = 1 << 3
QF_LOW_CONFIDENCE = 1 << 4

SF_IMU_OK = 1 << 0
SF_CHARGING = 1 << 1
SF_LOG_FULL = 1 << 2
SF_SATURATED_RECENT = 1 << 3
SF_CONFIG_DIRTY = 1 << 4
SF_CALIBRATED = 1 << 5

QF_NAMES = {
    QF_SATURATED: "saturado",
    QF_WEAK_ZUPT: "zupt-debil",
    QF_ROM_OUTLIER: "rom-atipico",
    QF_HIGH_ROTATION: "rotacion-alta",
    QF_LOW_CONFIDENCE: "baja-confianza",
}


class SchemaMismatch(ValueError):
    """El payload viene con una version de esquema que no conocemos."""


def _check_schema(value: int) -> None:
    if value != SCHEMA_VERSION:
        raise SchemaMismatch(f"esquema {value}, esperaba {SCHEMA_VERSION}")


@dataclass
class RepResult:
    rep_index: int
    mean_conc_vel: float  # m/s
    mean_prop_vel: float
    peak_vel: float
    rom: float  # m
    conc_dur_ms: int
    ecc_dur_ms: int
    pause_ms: int
    quality_flags: int
    peak_vel_pos: int
    set_index: int

    @property
    def flag_names(self) -> list:
        return [n for bit, n in QF_NAMES.items() if self.quality_flags & bit]

    def __str__(self) -> str:
        flags = (" [" + ", ".join(self.flag_names) + "]") if self.quality_flags else ""
        return (
            f"rep {self.rep_index:2d}  {self.mean_conc_vel:.2f} m/s  "
            f"pico {self.peak_vel:.2f}  ROM {self.rom * 100:.0f} cm  "
            f"conc {self.conc_dur_ms} ms{flags}"
        )


def parse_rep_result(data: bytes) -> RepResult:
    f = struct.unpack(FMT_REP_RESULT, data)
    _check_schema(f[0])
    return RepResult(
        rep_index=f[1],
        mean_conc_vel=f[2] / 1000.0,
        mean_prop_vel=f[3] / 1000.0,
        peak_vel=f[4] / 1000.0,
        rom=f[5] / 1000.0,
        conc_dur_ms=f[6],
        ecc_dur_ms=f[7],
        pause_ms=f[8],
        quality_flags=f[9],
        peak_vel_pos=f[10],
        set_index=f[11],
    )


@dataclass
class SetSummary:
    set_index: int
    rep_count: int
    exercise: Exercise
    best_mean_vel: float
    first_rep_vel: float
    last_rep_vel: float
    velocity_loss_pct: float
    load_kg: float
    duration_ms: int
    flags: int


def parse_set_summary(data: bytes) -> SetSummary:
    f = struct.unpack(FMT_SET_SUMMARY, data)
    _check_schema(f[0])
    return SetSummary(
        set_index=f[1],
        rep_count=f[2],
        exercise=Exercise(f[3]),
        best_mean_vel=f[4] / 1000.0,
        first_rep_vel=f[5] / 1000.0,
        last_rep_vel=f[6] / 1000.0,
        velocity_loss_pct=f[7] / 10.0,
        load_kg=f[8] / 10.0,
        duration_ms=f[9],
        flags=f[10],
    )


@dataclass
class Status:
    state: State
    battery_pct: int
    flags: int
    battery_mv: int
    rep_count: int
    exercise: Exercise
    uptime_s: int
    log_free_bytes: int
    fw_version: str
    last_error: int


def parse_status(data: bytes) -> Status:
    f = struct.unpack(FMT_STATUS, data)
    _check_schema(f[0])
    return Status(
        state=State(f[1]),
        battery_pct=f[2],
        flags=f[3],
        battery_mv=f[4],
        rep_count=f[5],
        exercise=Exercise(f[6]),
        uptime_s=f[7],
        log_free_bytes=f[8],
        fw_version=f"{f[9] >> 8}.{f[9] & 0xFF}",
        last_error=f[10],
    )


def parse_batch(data: bytes):
    """Devuelve (seq, t0_us, [(ax,ay,az,gx,gy,gz) crudos], saturo)."""
    hdr_size = struct.calcsize(FMT_BATCH_HEADER)
    schema, count, seq, t0_us = struct.unpack(FMT_BATCH_HEADER, data[:hdr_size])
    _check_schema(schema)
    sample_size = struct.calcsize(FMT_SAMPLE)
    needed = hdr_size + count * sample_size
    if len(data) < needed:
        raise ValueError(f"lote truncado: {len(data)} B, esperaba {needed}")

    samples = []
    saturated = False
    for i in range(count):
        off = hdr_size + i * sample_size
        s = struct.unpack(FMT_SAMPLE, data[off : off + sample_size])
        if any(abs(v) >= SAMPLE_SATURATED for v in s):
            saturated = True
        samples.append(s)
    return seq, t0_us, samples, saturated


def to_si(sample):
    """Muestra cruda -> (ax,ay,az) en g y (gx,gy,gz) en dps."""
    ax, ay, az, gx, gy, gz = sample
    return (
        ax * ACCEL_LSB_MG / 1000.0,
        ay * ACCEL_LSB_MG / 1000.0,
        az * ACCEL_LSB_MG / 1000.0,
        gx * GYRO_LSB_MDPS / 1000.0,
        gy * GYRO_LSB_MDPS / 1000.0,
        gz * GYRO_LSB_MDPS / 1000.0,
    )


def build_control(opcode: Opcode, payload: bytes = b"") -> bytes:
    return bytes([SCHEMA_VERSION, int(opcode)]) + payload


def build_set_start(exercise: Exercise, load_kg: float) -> bytes:
    return build_control(
        Opcode.SET_START, struct.pack("<BH", int(exercise), round(load_kg * 10))
    )


# ---------------------------------------------------------------------------
# Autotest: verifica este archivo contra docs/PROTOCOL.md
# ---------------------------------------------------------------------------

def _selftest() -> int:
    fallas = []

    def check(cond, msg):
        if not cond:
            fallas.append(msg)

    # Tamanos. Los tres payloads de notificacion tienen que entrar en 20 bytes,
    # que es el maximo con el MTU por defecto.
    check(struct.calcsize(FMT_REP_RESULT) == 20, "RepResult no mide 20 B")
    check(struct.calcsize(FMT_SET_SUMMARY) == 20, "SetSummary no mide 20 B")
    check(struct.calcsize(FMT_STATUS) == 20, "Status no mide 20 B")
    check(struct.calcsize(FMT_CONFIG) == 8, "Config no mide 8 B")
    check(struct.calcsize(FMT_SAMPLE) == 12, "Sample no mide 12 B")
    check(struct.calcsize(FMT_BATCH_HEADER) == 8, "BatchHeader no mide 8 B")
    check(BATCH_MAX_SAMPLES == 19, f"esperaba 19 muestras por lote, dan {BATCH_MAX_SAMPLES}")

    # Ida y vuelta de RepResult, con los offsets de PROTOCOL.md.
    raw = struct.pack(
        FMT_REP_RESULT, SCHEMA_VERSION, 3, 450, 520, 890, 420, 610, 1200, 350,
        QF_WEAK_ZUPT, 62, 1, 0,
    )
    check(len(raw) == 20, "el RepValue serializado no mide 20 B")
    check(raw[2] == 0xC2 and raw[3] == 0x01, "mean_conc_vel mal serializado (little-endian)")
    rep = parse_rep_result(raw)
    check(abs(rep.mean_conc_vel - 0.45) < 1e-9, "mean_conc_vel mal convertido")
    check(abs(rep.rom - 0.42) < 1e-9, "ROM mal convertido")
    check(rep.flag_names == ["zupt-debil"], "quality_flags mal decodificado")

    # Un payload con esquema desconocido tiene que fallar fuerte, no devolver basura.
    bad = bytearray(raw)
    bad[0] = 99
    try:
        parse_rep_result(bytes(bad))
        fallas.append("un esquema desconocido no levanto SchemaMismatch")
    except SchemaMismatch:
        pass

    # Lote lleno: tiene que entrar justo en el MTU negociado.
    hdr = struct.pack(FMT_BATCH_HEADER, SCHEMA_VERSION, BATCH_MAX_SAMPLES, 7, 123456)
    body = b"".join(
        struct.pack(FMT_SAMPLE, 100 * i, -200, 4096, 1, 2, 3)
        for i in range(BATCH_MAX_SAMPLES)
    )
    packet = hdr + body
    check(len(packet) <= BATCH_MAX_PAYLOAD, "el lote lleno se pasa del payload maximo")
    seq, t0, samples, sat = parse_batch(packet)
    check(seq == 7 and t0 == 123456, "encabezado de lote mal parseado")
    check(len(samples) == BATCH_MAX_SAMPLES, "cantidad de muestras incorrecta")
    check(not sat, "marco saturacion donde no la hay")

    # Deteccion de saturacion.
    sat_packet = struct.pack(FMT_BATCH_HEADER, SCHEMA_VERSION, 1, 8, 0) + struct.pack(
        FMT_SAMPLE, SAMPLE_SATURATED, 0, 0, 0, 0, 0
    )
    _, _, _, sat2 = parse_batch(sat_packet)
    check(sat2, "no detecto la saturacion del acelerometro")

    # Un lote truncado tiene que fallar, no leer memoria de al lado.
    try:
        parse_batch(packet[:-5])
        fallas.append("un lote truncado no levanto ValueError")
    except ValueError:
        pass

    # Escala: 1 g tiene que dar ~4098 cuentas a +-8 g.
    g_counts = round(1000.0 / ACCEL_LSB_MG)
    check(4090 < g_counts < 4110, f"la escala del acelerometro da raro: 1 g = {g_counts} cuentas")

    # Comandos de Control.
    cmd = build_set_start(Exercise.BENCH, 82.5)
    check(cmd == bytes([1, 0x01, 1, 0x39, 0x03]), f"SET_START mal armado: {cmd.hex()}")

    if fallas:
        print(f"protocol: {len(fallas)} FALLAS")
        for f in fallas:
            print("  -", f)
        return 1

    print(f"protocol OK (schema {SCHEMA_VERSION})")
    print(f"  RepResult {struct.calcsize(FMT_REP_RESULT)} B, "
          f"SetSummary {struct.calcsize(FMT_SET_SUMMARY)} B, "
          f"Status {struct.calcsize(FMT_STATUS)} B")
    print(f"  lote: {BATCH_MAX_SAMPLES} muestras = "
          f"{struct.calcsize(FMT_BATCH_HEADER) + BATCH_MAX_SAMPLES * struct.calcsize(FMT_SAMPLE)} B "
          f"de {BATCH_MAX_PAYLOAD} -> a 208 Hz son {208 / BATCH_MAX_SAMPLES:.1f} notificaciones/s")
    print(f"  ejemplo: {parse_rep_result(raw)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(_selftest())
