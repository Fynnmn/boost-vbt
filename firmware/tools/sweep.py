"""Barrido de umbrales del detector contra todo el dataset.

Ajustar umbrales de a uno mirando un archivo es lento y enganoso: un cambio
que arregla una serie rompe otras dos y uno se entera tarde. Esto prueba
combinaciones y las ordena por la metrica real.

    python tools/sweep.py dataset/raw/synth
    python tools/sweep.py dataset/raw/synth --top 15

Los mismos parametros se exponen por BLE en el firmware, asi que lo que salga
de aca se puede cargar en el sensor sin recompilar.
"""

import argparse
import itertools
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import metrics  # noqa: E402

# Rejilla. Deliberadamente chica: barrer mucho contra un dataset sintetico de
# 19 reps es sobreajustar ruido, no encontrar buenos valores.
GRID = {
    "VBT_GRAV_STILL": [0.30, 0.15],
    "VBT_GRAV_MOTION": [0.15, 0.10, 0.06],
    "VBT_ZUPT_ACC": [0.020, 0.025, 0.030],
    "VBT_ZUPT_MS": [120, 150],
    "VBT_VEL_START": [0.12, 0.09],
}


def evaluar(directorio, combo):
    for k, v in combo.items():
        os.environ[k] = str(v)

    archivos = []
    for raiz, _, nombres in os.walk(directorio):
        for n in sorted(nombres):
            if n.endswith(".vbt"):
                archivos.append(os.path.join(raiz, n))

    filas = [f for f in (metrics.evaluate(a) for a in archivos) if f]
    positivas = [f for f in filas
                 if not f.get("negativa") and not f.get("sin_labels")]
    negativas = [f for f in filas if f.get("negativa")]

    total = sum(f["esperadas"] for f in positivas)
    error = sum(abs(f["detectadas"] - f["esperadas"]) for f in positivas)
    precision = (1.0 - error / total) if total else 0.0
    fp = sum(f["detectadas"] for f in negativas)
    maes = [f["mae_vel"] for f in positivas if f["mae_vel"] is not None]
    mae = sum(maes) / len(maes) if maes else 99.0
    return precision, fp, mae


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("directorio")
    ap.add_argument("--top", type=int, default=10)
    args = ap.parse_args()

    claves = list(GRID)
    combos = [dict(zip(claves, vals))
              for vals in itertools.product(*(GRID[k] for k in claves))]
    print(f"{len(combos)} combinaciones\n")

    resultados = []
    for i, combo in enumerate(combos):
        prec, fp, mae = evaluar(args.directorio, combo)
        resultados.append((prec, -fp, -mae, combo))
        if (i + 1) % 20 == 0:
            print(f"  {i + 1}/{len(combos)}...")

    # Orden: primero conteo, despues falsos positivos, despues error de
    # velocidad. El conteo manda porque es la metrica que decide el proyecto.
    resultados.sort(key=lambda r: (r[0], r[1], r[2]), reverse=True)

    print(f"\n{'prec':>6} {'FP':>4} {'MAE':>7}  parametros")
    for prec, negfp, negmae, combo in resultados[:args.top]:
        params = " ".join(f"{k.replace('VBT_', '')}={v}" for k, v in combo.items())
        print(f"{prec * 100:>5.1f}% {-negfp:>4} {-negmae:>7.3f}  {params}")

    mejor = resultados[0]
    print(f"\nMejor: {mejor[0] * 100:.1f}% de conteo, {-mejor[1]} falsos "
          f"positivos, MAE {-mejor[2]:.3f} m/s")
    print("Ojo: esto esta ajustado contra senal sintetica de 19 reps. Los "
          "valores hay que revalidarlos contra datos reales, no adoptarlos.")


if __name__ == "__main__":
    raise SystemExit(main())
