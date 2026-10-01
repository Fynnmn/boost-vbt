"""Extrae las sesiones grabadas por el sensor y las guarda como archivos .vbt.

Dos modos:

    # desde una imagen completa de la flash (la que vuelca el test, o un
    # volcado por USB)
    python tools/dump_log.py --imagen build/flash_image.bin --out dataset/raw/hoy

    # desde el sensor por BLE (requiere hardware; ver la nota abajo)
    python tools/dump_log.py --ble --out dataset/raw/hoy

El header de sesion que escribe el firmware en flash es EXACTAMENTE el header
del archivo .vbt (32 bytes, ver docs/DATASET.md). Extraer una sesion es copiar
un tramo de bytes, sin conversion: menos codigo y ninguna oportunidad de que
los dos formatos se desincronicen.
"""

import argparse
import json
import os
import struct
import sys

HEADER_FMT = "<4sHHBHBIIHB9s"
HEADER_SIZE = struct.calcsize(HEADER_FMT)
BYTES_PER_SAMPLE = 12
SECTOR_SIZE = 4096
SESSION_OPEN = 0xFFFFFFFF

EXERCISE_NAMES = {
    0: "unknown", 1: "bench", 2: "squat", 3: "deadlift",
    4: "ohp", 5: "row", 6: "hipthrust",
}


def parse_header(blob):
    (magic, version, odr, accel_fs, gyro_fs, exercise, count, t0, load_x10,
     origin, _) = struct.unpack(HEADER_FMT, blob[:HEADER_SIZE])
    if magic != b"VBT1":
        return None
    return {
        "format_version": version,
        "odr_hz": odr,
        "accel_fs_g": accel_fs,
        "gyro_fs_dps": gyro_fs,
        "exercise_id": exercise,
        "sample_count": count,
        "t0_unix": t0,
        "load_kg": load_x10 / 10.0,
        "origin": origin,
    }


def align_up(value, unit):
    return ((value + unit - 1) // unit) * unit


def scan_image(data):
    """Recorre la imagen sector por sector, igual que hace el firmware."""
    sesiones = []
    addr = 0
    while addr + HEADER_SIZE <= len(data):
        h = parse_header(data[addr:addr + HEADER_SIZE])
        if h is None:
            break

        if h["sample_count"] == SESSION_OPEN:
            # Sesion que quedo abierta: se corto la energia grabando. Los datos
            # estan y valen; lo que falta es el contador. Se recupera contando
            # hasta donde la flash vuelve a estar borrada (todo 0xFF).
            fin = addr + HEADER_SIZE
            while fin < len(data) and data[fin:fin + BYTES_PER_SAMPLE] != b"\xff" * BYTES_PER_SAMPLE:
                fin += BYTES_PER_SAMPLE
            usable = (fin - addr - HEADER_SIZE) // BYTES_PER_SAMPLE
            h["sample_count"] = usable
            h["recuperada"] = True
        else:
            h["recuperada"] = False

        total = HEADER_SIZE + h["sample_count"] * BYTES_PER_SAMPLE
        h["addr"] = addr
        h["bytes"] = total
        sesiones.append(h)
        addr = align_up(addr + total, SECTOR_SIZE)
        if h["bytes"] <= HEADER_SIZE:
            addr = align_up(addr + 1, SECTOR_SIZE)
    return sesiones


def write_vbt(outdir, name, data, h):
    os.makedirs(outdir, exist_ok=True)
    path = os.path.join(outdir, f"{name}.vbt")
    total = HEADER_SIZE + h["sample_count"] * BYTES_PER_SAMPLE

    blob = bytearray(data[h["addr"]:h["addr"] + total])
    if h["recuperada"]:
        # Escribir el contador recuperado para que el archivo sea valido.
        struct.pack_into("<I", blob, 12, h["sample_count"])

    with open(path, "wb") as f:
        f.write(blob)

    meta = {
        "exercise": EXERCISE_NAMES.get(h["exercise_id"], "unknown"),
        "load_kg": h["load_kg"],
        "odr_hz": h["odr_hz"],
        "t0_unix": h["t0_unix"],
        "recuperada_sin_cierre": h["recuperada"],
        "notes": "",
    }
    with open(os.path.join(outdir, f"{name}.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2, ensure_ascii=False)
    return path


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--imagen", help="volcado completo de la flash")
    ap.add_argument("--ble", action="store_true", help="leer del sensor por BLE")
    ap.add_argument("--out", default="dataset/raw/dump")
    ap.add_argument("--listar", action="store_true",
                    help="solo mostrar que hay, sin escribir archivos")
    args = ap.parse_args()

    if args.ble:
        sys.exit(
            "El modo BLE necesita el sensor conectado y todavia no hay hardware.\n"
            "Cuando llegue: pip install bleak, leer la characteristic LogDump\n"
            "(ver docs/PROTOCOL.md) y pasarle los bytes a scan_image()."
        )

    if not args.imagen:
        ap.error("pasa --imagen o --ble")

    with open(args.imagen, "rb") as f:
        data = f.read()

    sesiones = scan_image(data)
    if not sesiones:
        print("no hay sesiones en la imagen")
        return 1

    print(f"{len(sesiones)} sesiones en {args.imagen} ({len(data) // 1024} kB)\n")
    print(f"{'#':>2} {'ejercicio':<10} {'carga':>7} {'muestras':>9} {'seg':>7}  estado")
    for i, h in enumerate(sesiones):
        dur = h["sample_count"] / h["odr_hz"] if h["odr_hz"] else 0
        estado = "RECUPERADA (sin cierre)" if h["recuperada"] else "ok"
        print(f"{i:>2} {EXERCISE_NAMES.get(h['exercise_id'], '?'):<10} "
              f"{h['load_kg']:>6.1f}kg {h['sample_count']:>9} {dur:>7.1f}  {estado}")

    if args.listar:
        return 0

    print()
    for i, h in enumerate(sesiones):
        nombre = f"set_{i + 1:02d}"
        path = write_vbt(args.out, nombre, data, h)
        print(f"  {path}")

    print(f"\nListo. Ahora falta etiquetar contra el video: sin labels estas "
          f"grabaciones no sirven para medir nada.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
