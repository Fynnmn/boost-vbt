"""Mide el detector de reps contra todo el dataset de una sola vez.

Esta herramienta existe por una razon concreta: sin ella uno ajusta un umbral
mirando UN archivo, ve que mejora, y no se entera de que rompio otros cinco.
Ninguna mejora del algoritmo se acepta sin correr esto sobre el set completo.

    python tools/metrics.py dataset/raw/synth
    python tools/metrics.py dataset/raw/synth --detalle
    python tools/metrics.py dataset/raw/synth --guardar baseline.json
    python tools/metrics.py dataset/raw/synth --comparar baseline.json

La metrica principal es la que decide el proyecto:

    precision = 1 - (suma de |detectadas - reales|) / (total de reps reales)

Los falsos positivos de las grabaciones negativas se reportan aparte, porque
mezclarlos con el conteo esconde el peor error del sistema: contar reps
cuando el usuario ni siquiera esta entrenando.
"""

import argparse
import json
import os
import subprocess
import sys

REPLAY = os.path.join("build", "replay.exe" if os.name == "nt" else "replay")


def find_labels(vbt_path):
    """dataset/raw/<algo>/set_x.vbt -> dataset/raw/labels/set_x.labels.json"""
    base = os.path.splitext(os.path.basename(vbt_path))[0]
    raw_dir = os.path.dirname(vbt_path)
    candidatos = [
        os.path.join(os.path.dirname(raw_dir), "labels", f"{base}.labels.json"),
        os.path.join(raw_dir, "labels", f"{base}.labels.json"),
        os.path.join("dataset", "labels", f"{base}.labels.json"),
    ]
    for c in candidatos:
        if os.path.exists(c):
            return c
    return None


def run_replay(vbt_path):
    if not os.path.exists(REPLAY):
        sys.exit(f"falta {REPLAY}. Compilalo con: make replay ARCHIVO=...")
    out = subprocess.run([REPLAY, vbt_path, "--json"], capture_output=True,
                         text=True)
    if out.returncode != 0:
        return None
    try:
        return json.loads(out.stdout)
    except json.JSONDecodeError:
        return None


def match_reps(detected, expected):
    """Empareja reps detectadas con reales por SOLAPAMIENTO de la concentrica.

    Emparejar por cercania del instante de inicio no sirve: el detector
    reconstruye el arranque en el post-proceso y queda corrido unas decimas
    respecto del conteo por video. Con un umbral de cercania, una serie bien
    detectada aparecia como 5 falsos positivos y 6 falsos negativos a la vez,
    que es una contradiccion obvia y una senal de que la metrica estaba mal,
    no el algoritmo.

    Dos reps son la misma si sus ventanas concentricas se pisan. Es lo que uno
    haria mirando el video al lado del grafico.
    """
    libres = list(range(len(expected)))
    pares = []
    for i, d in enumerate(detected):
        d0, d1 = d["conc_start_ms"], d["conc_end_ms"]
        mejor, mejor_solape = None, 0
        for j in libres:
            e0, e1 = expected[j]["conc_start_ms"], expected[j]["conc_end_ms"]
            solape = min(d1, e1) - max(d0, e0)
            if solape > mejor_solape:
                mejor, mejor_solape = j, solape
        if mejor is not None:
            libres.remove(mejor)
            pares.append((i, mejor))
    return pares, libres


def evaluate(vbt_path, detalle=False):
    res = run_replay(vbt_path)
    if res is None:
        return None

    labels_path = find_labels(vbt_path)
    origen = res.get("origen", 0)

    if labels_path is None:
        return {"archivo": vbt_path, "sin_labels": True, "origen": origen,
                "detectadas": res["rep_count"]}

    with open(labels_path, encoding="utf-8") as f:
        labels = json.load(f)

    esperadas = labels.get("reps", [])
    esperado_n = labels.get("expected_rep_count", len(esperadas))
    detectadas = res["reps"]
    es_negativa = esperado_n == 0

    pares, no_emparejadas = match_reps(detectadas, esperadas)
    falsos_pos = len(detectadas) - len(pares)
    falsos_neg = len(no_emparejadas)

    # Error de velocidad contra el ground truth, solo donde lo hay.
    errores = []
    for i, j in pares:
        ref = esperadas[j].get("kinovea_mean_vel_ms")
        if ref:
            errores.append(abs(detectadas[i]["mean_conc_vel"] - ref))

    fila = {
        "archivo": vbt_path,
        "origen": origen,
        "esperadas": esperado_n,
        "detectadas": len(detectadas),
        "falsos_pos": falsos_pos,
        "falsos_neg": falsos_neg,
        "negativa": es_negativa,
        "mae_vel": sum(errores) / len(errores) if errores else None,
        "n_vel": len(errores),
    }
    if detalle:
        fila["reps"] = detectadas
        fila["pares"] = pares
    return fila


# Los mismos nombres que imprime replay.exe, para que las dos herramientas
# no se contradigan.
ORIGEN_NOMBRE = {0: "sensor real", 1: "sintetico", 2: "telefono"}


def resumir(filas):
    """Imprime la tabla de un conjunto y devuelve sus numeros.

    Recibe filas de UN SOLO origen: mezclarlos daria un promedio sin
    sentido (ver docs/DATASET.md).
    """
    positivas = [f for f in filas if not f.get("negativa") and not f.get("sin_labels")]
    negativas = [f for f in filas if f.get("negativa")]

    total_esperadas = sum(f["esperadas"] for f in positivas)
    error_conteo = sum(abs(f["detectadas"] - f["esperadas"]) for f in positivas)
    precision = (1.0 - error_conteo / total_esperadas) if total_esperadas else 0.0
    fp_negativas = sum(f["detectadas"] for f in negativas)

    print(f"{'archivo':<40} {'real':>5} {'det':>5} {'FP':>4} {'FN':>4} {'MAE vel':>9}")
    print("-" * 72)
    for f in filas:
        if f.get("sin_labels"):
            print(f"{os.path.basename(f['archivo']):<40} {'?':>5} "
                  f"{f['detectadas']:>5} {'':>4} {'':>4} {'sin labels':>9}")
            continue
        mae = f"{f['mae_vel']:.3f}" if f["mae_vel"] is not None else "-"
        marca = " NEG" if f["negativa"] else ""
        print(f"{os.path.basename(f['archivo']):<40} {f['esperadas']:>5} "
              f"{f['detectadas']:>5} {f['falsos_pos']:>4} {f['falsos_neg']:>4} "
              f"{mae:>9}{marca}")

    print("-" * 72)
    print(f"Precision de conteo: {precision * 100:.1f}%  "
          f"({total_esperadas - error_conteo:.0f}/{total_esperadas} reps)")

    todos_mae = [f["mae_vel"] for f in positivas if f["mae_vel"] is not None]
    if todos_mae:
        print(f"Error de velocidad (MAE): {sum(todos_mae) / len(todos_mae):.3f} m/s")

    if negativas:
        estado = "OK" if fp_negativas == 0 else "FALLA"
        print(f"Falsos positivos en {len(negativas)} grabaciones negativas: "
              f"{fp_negativas}  [{estado}]")

    return {
        "precision": precision,
        "total_esperadas": total_esperadas,
        "error_conteo": error_conteo,
        "fp_negativas": fp_negativas,
        "mae_vel": sum(todos_mae) / len(todos_mae) if todos_mae else None,
        "_mae": todos_mae,
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("directorio")
    ap.add_argument("--detalle", action="store_true")
    ap.add_argument("--guardar")
    ap.add_argument("--comparar")
    args = ap.parse_args()

    archivos = []
    for raiz, _, nombres in os.walk(args.directorio):
        for n in sorted(nombres):
            if n.endswith(".vbt"):
                archivos.append(os.path.join(raiz, n))
    if not archivos:
        sys.exit(f"no encontre archivos .vbt en {args.directorio}")

    filas = [f for f in (evaluate(a, args.detalle) for a in archivos) if f]

    # Las grabaciones de telefono (origen 2) tienen otra frecuencia, otro chip
    # y otro montaje que las del sensor. Un promedio que las mezcle no
    # significa nada, asi que se reporta un bloque por origen y el numero
    # global solo cuando hay un solo origen. Ver docs/DATASET.md.
    grupos = {}
    for f in filas:
        grupos.setdefault(f.get("origen", 0), []).append(f)

    resumenes = {}
    for origen in sorted(grupos):
        if len(grupos) > 1:
            print(f"\n### {ORIGEN_NOMBRE.get(origen, f'origen {origen}')}")
        resumenes[origen] = resumir(grupos[origen])

    if len(grupos) > 1:
        print("\nSon conjuntos distintos y no se promedian: frecuencia, chip y "
              "montaje no son los mismos.")

    # El baseline y el objetivo se miden contra el sensor real si lo hay;
    # si no, contra el unico origen presente.
    principal = 0 if 0 in resumenes else sorted(resumenes)[0]
    r = resumenes[principal]
    precision, total_esperadas = r["precision"], r["total_esperadas"]
    error_conteo, fp_negativas = r["error_conteo"], r["fp_negativas"]
    todos_mae = r["_mae"]

    objetivo = 0.95
    print()
    etiqueta = ORIGEN_NOMBRE.get(principal, f"origen {principal}")
    if precision >= objetivo and fp_negativas == 0:
        print(f"Objetivo alcanzado sobre {etiqueta} "
              f"({objetivo * 100:.0f}% de conteo, 0 falsos positivos).")
    else:
        print(f"Objetivo sobre {etiqueta}: {objetivo * 100:.0f}% de conteo y "
              f"0 falsos positivos. Todavia no.")

    resumen = {
        "precision": precision,
        "total_esperadas": total_esperadas,
        "error_conteo": error_conteo,
        "fp_negativas": fp_negativas,
        "mae_vel": sum(todos_mae) / len(todos_mae) if todos_mae else None,
        "origen": principal,
        "por_origen": {str(o): {k: v for k, v in x.items() if k != "_mae"}
                       for o, x in resumenes.items()},
        "archivos": {os.path.basename(f["archivo"]): f for f in filas},
    }

    if args.comparar:
        with open(args.comparar, encoding="utf-8") as fh:
            base = json.load(fh)
        # Comparar la precision del sensor contra un baseline de telefono
        # daria una diferencia inventada.
        if base.get("origen", 0) != principal:
            print(f"\nOJO: {args.comparar} es de "
                  f"{ORIGEN_NOMBRE.get(base.get('origen', 0), 'otro origen')} y "
                  f"esto es de {etiqueta}. No son comparables.")
        d_prec = precision - base["precision"]
        d_fp = fp_negativas - base["fp_negativas"]
        print(f"\nContra {args.comparar}:")
        print(f"  precision  {base['precision'] * 100:.1f}% -> {precision * 100:.1f}%  "
              f"({d_prec * 100:+.1f} pts)")
        print(f"  falsos pos {base['fp_negativas']} -> {fp_negativas}  ({d_fp:+d})")
        # Lo que mas importa de comparar: que archivo se rompio.
        for nombre, actual in resumen["archivos"].items():
            antes = base["archivos"].get(nombre)
            if not antes or actual.get("sin_labels"):
                continue
            if actual["detectadas"] != antes["detectadas"]:
                print(f"  {nombre}: {antes['detectadas']} -> "
                      f"{actual['detectadas']} reps (esperadas {actual['esperadas']})")

    if args.guardar:
        with open(args.guardar, "w", encoding="utf-8") as fh:
            json.dump(resumen, fh, indent=2)
        print(f"\nguardado en {args.guardar}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
