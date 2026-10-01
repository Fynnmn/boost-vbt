# Grabaciones con el teléfono (`origen = 2`)

Acá van los `.vbt` y `.json` que baja `app/grabar.html`, y **sólo** eso:
grabaciones de un teléfono atado a la barra, con movimiento humano real.

Nada sintético entra en esta carpeta. El archivo de prueba del formato vive
en `test/fixtures/prueba_formato.vbt` justamente para que la primera medición
real no arranque contaminada con señal inventada.

Los labels van en `dataset/labels/<nombre>.labels.json`. El `.json` que baja
la app trae `reps_reales`, pero `metrics.py` lee el `.labels.json`: hay que
pasarlo a mano, con el `expected_rep_count`.

Estas grabaciones **no se promedian con las del sensor**. `metrics.py` las
separa solo, por el campo `origen` del header. El porqué está en
`docs/DATASET.md`.
