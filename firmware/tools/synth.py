"""Generador de senal sintetica de press banca.

Sirve para escribir y depurar el detector de reps antes de que llegue la placa.

Lo que la sintetica SI prueba:
  - que el integrador con ZUPT no este roto (aca la velocidad real se conoce
    por construccion, cosa que con datos reales solo se logra con Kinovea)
  - que la maquina de estados del detector cierre bien los ciclos
  - que los casos negativos no cuenten reps

Lo que NO prueba, y conviene tener presente para no autoenganarse:
  - el ruido real de un LSM6DS3TR montado en una barra
  - la vibracion de los discos, el juego de la manga, el agarre
  - los "grinders" de verdad, que es donde los algoritmos simples mueren
  Una precision del 100% aca no significa absolutamente nada sobre el 95%
  en el gimnasio. Es andamio, no evidencia.

Uso:
    python tools/synth.py --preset ligero  --out dataset/raw/synth
    python tools/synth.py --preset pesado  --out dataset/raw/synth
    python tools/synth.py --preset negativos --out dataset/raw/synth
    python tools/synth.py --todos --out dataset/raw/synth
"""

import argparse
import json
import math
import os
import random
import struct

MAGIC = b"VBT1"
FORMAT_VERSION = 1
HEADER_FMT = "<4sHHBHBIIHB9s"
HEADER_SIZE = struct.calcsize(HEADER_FMT)
SAMPLE_FMT = "<6h"

G = 9.80665

ODR_HZ = 208
ACCEL_FS_G = 8
GYRO_FS_DPS = 1000
ACCEL_LSB_MG = 0.244
GYRO_LSB_MDPS = 35.0

EX_BENCH = 1
SAT = 32767


def _clamp16(v):
    return max(-32768, min(SAT, int(round(v))))


def accel_g_to_counts(value_g):
    return _clamp16(value_g * 1000.0 / ACCEL_LSB_MG)


def gyro_dps_to_counts(value_dps):
    return _clamp16(value_dps * 1000.0 / GYRO_LSB_MDPS)


class Signal:
    """Acumula muestras en unidades fisicas y las convierte al final.

    Trabajar en g y dps hasta el ultimo momento evita errores de escala
    dificiles de ver, y deja la saturacion como un efecto explicito del
    fondo de escala en vez de un accidente.
    """

    def __init__(self, odr_hz=ODR_HZ):
        self.odr = odr_hz
        self.dt = 1.0 / odr_hz
        self.ax = []
        self.ay = []
        self.az = []
        self.gx = []
        self.gy = []
        self.gz = []

    def __len__(self):
        return len(self.az)

    @property
    def duration_s(self):
        return len(self.az) * self.dt

    def append(self, ax, ay, az, gx=0.0, gy=0.0, gz=0.0):
        self.ax.append(ax)
        self.ay.append(ay)
        self.az.append(az)
        self.gx.append(gx)
        self.gy.append(gy)
        self.gz.append(gz)

    def n_for(self, seconds):
        return max(1, int(round(seconds * self.odr)))

    def to_bytes(self):
        out = bytearray()
        for i in range(len(self.az)):
            out += struct.pack(
                SAMPLE_FMT,
                accel_g_to_counts(self.ax[i]),
                accel_g_to_counts(self.ay[i]),
                accel_g_to_counts(self.az[i]),
                gyro_dps_to_counts(self.gx[i]),
                gyro_dps_to_counts(self.gy[i]),
                gyro_dps_to_counts(self.gz[i]),
            )
        return bytes(out)


# ---------------------------------------------------------------------------
# Perfiles de velocidad
# ---------------------------------------------------------------------------

def _vel_profile_smooth(u):
    """Media sinusoide: sube y baja suave. Rep facil, barra liviana."""
    return math.sin(math.pi * u)


def _vel_profile_grinder(u):
    """Perfil con sticking point: pico temprano, cae en el medio, se recupera.

    Es el caso que mas importa en VBT y el que peor detectan los algoritmos
    simples, porque la velocidad casi toca cero en la mitad de la concentrica
    y un detector ingenuo corta la rep en dos.
    """
    principal = math.sin(math.pi * u)
    valle = 0.55 * math.exp(-((u - 0.55) ** 2) / (2 * 0.11 ** 2))
    return max(0.02, principal - valle)


def _integrate_profile(profile, n):
    """Muestrea el perfil y lo normaliza para que integre exactamente 1."""
    vals = [profile((i + 0.5) / n) for i in range(n)]
    total = sum(vals)
    if total <= 0:
        return [0.0] * n
    return [v / total for v in vals]


# ---------------------------------------------------------------------------
# Construccion de una repeticion
# ---------------------------------------------------------------------------

def add_rep(sig, rom_m, ecc_s, pause_s, conc_s, lockout_s, grinder=False,
            tilt_deg=0.0):
    """Agrega una rep completa y devuelve (inicio_conc_ms, fin_conc_ms, vel_media).

    La velocidad media concentrica sale exacta: rom / conc_s. Ese es el ground
    truth contra el que se mide el integrador.
    """
    # --- excentrica: baja ---
    n_ecc = sig.n_for(ecc_s)
    shape_ecc = _integrate_profile(_vel_profile_smooth, n_ecc)
    _emit_phase(sig, shape_ecc, -rom_m, sig.dt, tilt_deg)

    # --- pausa en el pecho: instante cuasi-estatico, el ancla del ZUPT ---
    _emit_static(sig, sig.n_for(pause_s), tilt_deg)

    conc_start_ms = int(round(len(sig) * sig.dt * 1000))

    # --- concentrica: sube ---
    n_conc = sig.n_for(conc_s)
    profile = _vel_profile_grinder if grinder else _vel_profile_smooth
    shape_conc = _integrate_profile(profile, n_conc)
    _emit_phase(sig, shape_conc, rom_m, sig.dt, tilt_deg)

    conc_end_ms = int(round(len(sig) * sig.dt * 1000))

    # --- lockout: otro instante de reposo ---
    _emit_static(sig, sig.n_for(lockout_s), tilt_deg)

    return conc_start_ms, conc_end_ms, rom_m / conc_s


def _emit_phase(sig, shape, displacement_m, dt, tilt_deg):
    """Convierte un perfil de desplazamiento en aceleracion medida.

    El acelerometro mide fuerza especifica, no aceleracion: en reposo marca
    +1 g en el eje que apunta hacia arriba. Por eso az = 1 + a_propia/g.
    """
    vels = [(s * displacement_m) / dt for s in shape]
    prev_v = 0.0
    tilt = math.radians(tilt_deg)
    for v in vels:
        a = (v - prev_v) / dt  # m/s^2 propios
        prev_v = v
        az_total = 1.0 + a / G
        # Una leve inclinacion reparte la gravedad entre dos ejes: es lo que
        # obliga al detector a estimar orientacion en vez de asumir que Z es
        # perfectamente vertical.
        sig.append(
            ax=az_total * math.sin(tilt),
            ay=0.0,
            az=az_total * math.cos(tilt),
        )


def _emit_static(sig, n, tilt_deg):
    tilt = math.radians(tilt_deg)
    for _ in range(n):
        sig.append(ax=math.sin(tilt), ay=0.0, az=math.cos(tilt))


# ---------------------------------------------------------------------------
# Imperfecciones
# ---------------------------------------------------------------------------

def add_noise(sig, rng, accel_mg=8.0, gyro_dps=0.6):
    """Ruido blanco, del orden del que declara el datasheet del LSM6DS3TR."""
    s = accel_mg / 1000.0
    for i in range(len(sig)):
        sig.ax[i] += rng.gauss(0, s)
        sig.ay[i] += rng.gauss(0, s)
        sig.az[i] += rng.gauss(0, s)
        sig.gx[i] += rng.gauss(0, gyro_dps)
        sig.gy[i] += rng.gauss(0, gyro_dps)
        sig.gz[i] += rng.gauss(0, gyro_dps)


def add_bias(sig, ax_mg=0.0, ay_mg=0.0, az_mg=25.0):
    """Offset constante del acelerometro.

    Es la imperfeccion mas importante de todas: un bias de 25 mg integrado
    durante 3 segundos son ~2,2 m/s de velocidad inventada. Es exactamente
    lo que el ZUPT tiene que matar. Si el detector funciona con bias cero
    pero se rompe con bias, el integrador esta mal y en la placa real
    tambien va a fallar.
    """
    for i in range(len(sig)):
        sig.ax[i] += ax_mg / 1000.0
        sig.ay[i] += ay_mg / 1000.0
        sig.az[i] += az_mg / 1000.0


def add_bar_vibration(sig, rng, freq_hz=14.0, amp_mg=45.0, decay_s=0.35):
    """Vibracion de los discos despues de cada cambio brusco de aceleracion."""
    amp = amp_mg / 1000.0
    n = len(sig)
    triggers = []
    for i in range(2, n):
        if abs(sig.az[i] - sig.az[i - 1]) > 0.08:
            if not triggers or i - triggers[-1] > sig.n_for(0.25):
                triggers.append(i)
    for t in triggers:
        for k in range(sig.n_for(decay_s)):
            i = t + k
            if i >= n:
                break
            tt = k * sig.dt
            env = math.exp(-tt / decay_s) * amp * rng.uniform(0.7, 1.3)
            sig.az[i] += env * math.sin(2 * math.pi * freq_hz * tt)
            sig.ay[i] += 0.4 * env * math.sin(2 * math.pi * freq_hz * 1.7 * tt)


def add_rack_event(sig, rng, magnitude_g=6.0):
    """Golpe de montar o desmontar la barra del rack.

    Genera picos de varios g. Es el motivo por el que el fondo de escala es
    +-8 g y no +-2 g: a +-2 g esto satura y la velocidad calculada queda mal
    sin que se note mirando el grafico.
    """
    _emit_static(sig, sig.n_for(0.4), 0.0)
    for k in range(sig.n_for(0.12)):
        tt = k * sig.dt
        env = math.exp(-tt / 0.04)
        sig.append(
            ax=rng.gauss(0, 0.5) * env,
            ay=rng.gauss(0, 0.5) * env,
            az=1.0 + magnitude_g * env * rng.uniform(0.8, 1.2),
            gx=rng.gauss(0, 80) * env,
            gy=rng.gauss(0, 80) * env,
            gz=rng.gauss(0, 40) * env,
        )
    _emit_static(sig, sig.n_for(0.5), 0.0)


def add_walking(sig, rng, seconds=6.0, steps_per_s=1.8):
    """Caminar con el sensor en la mano. Nunca puede contar como rep."""
    for k in range(sig.n_for(seconds)):
        tt = k * sig.dt
        paso = 0.35 * math.sin(2 * math.pi * steps_per_s * tt)
        balanceo = 0.18 * math.sin(2 * math.pi * steps_per_s * 0.5 * tt)
        sig.append(
            ax=balanceo + rng.gauss(0, 0.05),
            ay=0.12 * math.sin(2 * math.pi * steps_per_s * tt + 1.0),
            az=1.0 + paso + rng.gauss(0, 0.06),
            gx=rng.gauss(0, 25),
            gy=rng.gauss(0, 18),
            gz=rng.gauss(0, 12),
        )


def add_bag(sig, rng, seconds=8.0):
    """El sensor tirado en el bolso: movimiento lento y orientacion cualquiera."""
    base_tilt = rng.uniform(0, math.pi)
    for k in range(sig.n_for(seconds)):
        tt = k * sig.dt
        drift = 0.05 * math.sin(2 * math.pi * 0.3 * tt)
        sig.append(
            ax=math.sin(base_tilt) + drift + rng.gauss(0, 0.02),
            ay=rng.gauss(0, 0.02),
            az=math.cos(base_tilt) + drift + rng.gauss(0, 0.02),
            gx=rng.gauss(0, 4),
            gy=rng.gauss(0, 4),
            gz=rng.gauss(0, 4),
        )


# ---------------------------------------------------------------------------
# Series
# ---------------------------------------------------------------------------

def make_set(reps=8, rom_m=0.42, conc_s0=0.55, fatigue=0.10, grinders=0,
             load_kg=80.0, tilt_deg=3.0, bias_mg=25.0, seed=1):
    """Serie completa con fatiga: cada rep un poco mas lenta que la anterior."""
    rng = random.Random(seed)
    sig = Signal()
    labels = []

    _emit_static(sig, sig.n_for(1.5), tilt_deg)  # unrack y acomodarse

    for i in range(reps):
        # La velocidad cae de forma acumulativa, como en una serie real.
        conc_s = conc_s0 * (1.0 + fatigue) ** i * rng.uniform(0.97, 1.03)
        es_grinder = i >= reps - grinders
        if es_grinder:
            conc_s *= 1.8

        start, end, vel = add_rep(
            sig,
            rom_m=rom_m * rng.uniform(0.97, 1.03),
            ecc_s=rng.uniform(1.5, 2.1),
            pause_s=rng.uniform(0.3, 0.7),
            conc_s=conc_s,
            lockout_s=rng.uniform(0.6, 1.2),
            grinder=es_grinder,
            tilt_deg=tilt_deg,
        )
        labels.append({
            "conc_start_ms": start,
            "conc_end_ms": end,
            "kinovea_mean_vel_ms": round(vel, 4),
            "grinder": es_grinder,
        })

    _emit_static(sig, sig.n_for(1.0), tilt_deg)
    add_rack_event(sig, rng)  # rerackear al final: no es una rep

    add_bar_vibration(sig, rng)
    add_bias(sig, az_mg=bias_mg)
    add_noise(sig, rng)

    meta = {
        "exercise": "bench",
        "load_kg": load_kg,
        "intended_reps": reps,
        "grinders": grinders,
        "tempo": "controlado",
        "paused": True,
        "bar_type": "olympic",
        "mount": "sleeve-inner",
        "notes": "sintetico -- no es evidencia de nada, es andamio",
    }
    return sig, labels, meta


def make_negative(kind, seed=1):
    """Grabacion que tiene que dar CERO reps."""
    rng = random.Random(seed)
    sig = Signal()

    if kind == "rack":
        for _ in range(4):
            add_rack_event(sig, rng)
            _emit_static(sig, sig.n_for(1.0), 0.0)
    elif kind == "caminar":
        add_walking(sig, rng, seconds=10.0)
    elif kind == "bolso":
        add_bag(sig, rng, seconds=12.0)
    elif kind == "apoyada":
        # La barra apoyada en el pecho mientras el tipo charla: hay micro
        # movimiento por la respiracion, pero no hay rep.
        for k in range(sig.n_for(10.0)):
            tt = k * sig.dt
            resp = 0.03 * math.sin(2 * math.pi * 0.25 * tt)
            sig.append(ax=0.05, ay=0.0, az=1.0 + resp + rng.gauss(0, 0.01))
    else:
        raise ValueError(f"tipo negativo desconocido: {kind}")

    add_bias(sig, az_mg=20.0)
    add_noise(sig, rng)

    meta = {
        "exercise": "none",
        "load_kg": 0.0,
        "intended_reps": 0,
        "negative_kind": kind,
        "notes": "grabacion negativa: tiene que dar cero reps",
    }
    return sig, [], meta


# ---------------------------------------------------------------------------
# Escritura
# ---------------------------------------------------------------------------

def write_dataset(outdir, name, sig, labels, meta, load_kg=0.0,
                  exercise_id=EX_BENCH, t0_unix=0):
    os.makedirs(outdir, exist_ok=True)
    labels_dir = os.path.join(os.path.dirname(outdir.rstrip("/\\")) or ".",
                              "labels")
    os.makedirs(labels_dir, exist_ok=True)

    header = struct.pack(
        HEADER_FMT, MAGIC, FORMAT_VERSION, sig.odr, ACCEL_FS_G, GYRO_FS_DPS,
        exercise_id, len(sig), t0_unix, int(round(load_kg * 10)), 1, b"\x00" * 9,
    )
    assert len(header) == HEADER_SIZE, f"header de {len(header)} B"

    path_vbt = os.path.join(outdir, f"{name}.vbt")
    with open(path_vbt, "wb") as f:
        f.write(header)
        f.write(sig.to_bytes())

    with open(os.path.join(outdir, f"{name}.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2, ensure_ascii=False)

    labels_obj = {
        "source": "synthetic",
        "fps": None,
        "reps": labels,
        "expected_rep_count": len(labels),
    }
    with open(os.path.join(labels_dir, f"{name}.labels.json"), "w",
              encoding="utf-8") as f:
        json.dump(labels_obj, f, indent=2, ensure_ascii=False)

    sat = sum(
        1 for i in range(len(sig))
        if abs(accel_g_to_counts(sig.az[i])) >= SAT
        or abs(accel_g_to_counts(sig.ax[i])) >= SAT
    )
    return {
        "archivo": path_vbt,
        "muestras": len(sig),
        "duracion_s": round(sig.duration_s, 2),
        "reps": len(labels),
        "saturadas": sat,
    }


PRESETS = {
    "ligero": dict(reps=8, rom_m=0.42, conc_s0=0.32, fatigue=0.05,
                   grinders=0, load_kg=60.0),
    "medio": dict(reps=6, rom_m=0.41, conc_s0=0.52, fatigue=0.10,
                  grinders=0, load_kg=85.0),
    "pesado": dict(reps=5, rom_m=0.40, conc_s0=0.78, fatigue=0.16,
                   grinders=2, load_kg=105.0),
}

NEGATIVOS = ["rack", "caminar", "bolso", "apoyada"]


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--preset", choices=list(PRESETS) + ["negativos"])
    ap.add_argument("--todos", action="store_true",
                    help="genera todos los presets y todos los negativos")
    ap.add_argument("--out", default="dataset/raw/synth")
    ap.add_argument("--seed", type=int, default=1)
    args = ap.parse_args()

    if not args.preset and not args.todos:
        ap.error("elegi --preset o --todos")

    trabajos = []
    if args.todos:
        trabajos = list(PRESETS) + ["negativos"]
    else:
        trabajos = [args.preset]

    filas = []
    for t in trabajos:
        if t == "negativos":
            for i, kind in enumerate(NEGATIVOS):
                sig, labels, meta = make_negative(kind, seed=args.seed + i)
                filas.append(write_dataset(
                    args.out, f"neg_{kind}", sig, labels, meta,
                    exercise_id=0))
        else:
            cfg = PRESETS[t]
            sig, labels, meta = make_set(seed=args.seed, **cfg)
            filas.append(write_dataset(
                args.out, f"set_{t}", sig, labels, meta,
                load_kg=cfg["load_kg"]))

    print(f"{'archivo':<44} {'muestras':>9} {'seg':>7} {'reps':>5} {'sat':>5}")
    for r in filas:
        print(f"{r['archivo']:<44} {r['muestras']:>9} {r['duracion_s']:>7.1f} "
              f"{r['reps']:>5} {r['saturadas']:>5}")

    total_reps = sum(r["reps"] for r in filas)
    print(f"\n{len(filas)} grabaciones, {total_reps} reps etiquetadas")
    print("Recordatorio: 100% de precision aca no dice nada sobre el gimnasio.")


if __name__ == "__main__":
    main()
