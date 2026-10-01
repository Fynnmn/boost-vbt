#!/usr/bin/env python3
"""Comprueba que el `.vbt` que escribe la app sigue el header de DATASET.md.

Un offset corrido no rompe nada de forma visible: `replay.exe` lee el archivo,
no se queja, y devuelve numeros equivocados. Esta comprobacion existe para que
eso falle fuerte y temprano.

    python tools/check_formato.py
"""

import json
import os
import struct
import subprocess
import sys

FIXTURE = os.path.join("test", "fixtures", "prueba_formato.vbt")
REPLAY = os.path.join("build", "replay.exe" if os.name == "nt" else "replay")

# Lo que dice docs/DATASET.md, escrito aparte a proposito: si alguien cambia
# imu.js y la tabla de la doc, esto tiene que seguir siendo la tercera opinion.
CAMPOS = [
    ("magic",          0,  "4s", b"VBT1"),
    ("version",        4,  "<H", 1),
    ("odr_hz",         6,  "<H", 60),
    ("accel_fs_g",     8,  "<B", 8),
    ("gyro_fs_dps",    9,  "<H", 1000),
    ("exercise_id",   11,  "<B", 1),
    ("sample_count",  12,  "<I", 480),
    ("load_kg_x10",   20,  "<H", 825),
    ("origen",        22,  "<B", 2),
]


def main():
    if not os.path.exists(FIXTURE):
        sys.exit(f"falta {FIXTURE}. Generalo con: node tools/gen_vbt_prueba.mjs")

    with open(FIXTURE, "rb") as f:
        datos = f.read()

    fallas = []
    for nombre, off, fmt, esperado in CAMPOS:
        real = struct.unpack_from(fmt, datos, off)[0]
        estado = "ok" if real == esperado else "MAL"
        if real != esperado:
            fallas.append(f"  {nombre} en offset {off}: {real!r}, se esperaba {esperado!r}")
        print(f"  {nombre:<14} offset {off:>2}  {real!r:<12} {estado}")

    # Los 9 bytes reservados tienen que estar en cero: si algun dia se usan,
    # un archivo viejo con basura ahi se interpretaria mal.
    if datos[23:32] != b"\x00" * 9:
        fallas.append("  los 9 bytes reservados (23..31) no estan en cero")

    esperado_len = 32 + 480 * 12
    if len(datos) != esperado_len:
        fallas.append(f"  tamano {len(datos)} B, se esperaban {esperado_len} B "
                      "(32 de header + 12 por muestra)")

    # La gravedad en reposo: si la escala del acelerometro estuviera mal, la
    # primera muestra no daria 1 g y todas las velocidades saldrian corridas.
    ax, ay, az = struct.unpack_from("<3h", datos, 32)
    g = (ax * ax + ay * ay + az * az) ** 0.5 * 0.000244
    print(f"  gravedad en reposo    {g:.3f} g")
    if abs(g - 1.0) > 0.05:
        fallas.append(f"  la primera muestra da {g:.3f} g y en reposo tiene que dar ~1 g")

    # Y que las herramientas del firmware lo lean de verdad, no solo que los
    # bytes parezcan bien puestos.
    if os.path.exists(REPLAY):
        out = subprocess.run([REPLAY, FIXTURE, "--json"],
                             capture_output=True, text=True)
        try:
            res = json.loads(out.stdout)
        except json.JSONDecodeError:
            fallas.append("  replay no devolvio JSON valido")
        else:
            print(f"  replay lo lee          {res['muestras']} muestras, "
                  f"{res['odr_hz']} Hz, origen {res['origen_nombre']!r}")
            if res["origen_nombre"] != "telefono":
                fallas.append(f"  replay dice origen {res['origen_nombre']!r} "
                              "y tiene que decir 'telefono'")
    else:
        print(f"  ({REPLAY} no esta compilado, se saltea esa parte)")

    print()
    if fallas:
        print("FALLA: el .vbt de la app no coincide con docs/DATASET.md")
        print("\n".join(fallas))
        return 1
    print("OK: el .vbt de la app coincide con docs/DATASET.md")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
