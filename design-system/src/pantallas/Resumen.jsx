import React from 'react';
import { color, texto, vbt } from '../tokens/tokens.js';
import { Pantalla, Tarjeta, Encabezado, Disco } from '../components/Superficies.jsx';
import { DatoGrande, Cifra, GraficoReps, Aviso } from '../components/Datos.jsx';
import { Boton, PildoraVidrio, CabeceraEjercicio } from '../components/Controles.jsx';
import { IconoReloj, IconoCaida, IconoAviso } from '../components/Iconos.jsx';

// RESUMEN DE SERIE. Aparece al finalizar. La caída de velocidad no es una celda
// más de una grilla de cuatro iguales: es la métrica que decide qué hacer en la
// próxima serie, así que ocupa su propio bloque y lleva el color del estado.
// El descanso empieza a correr acá, sin que haya que apretar nada.
export function Resumen({
  ejercicio = 'Press de banca',
  serie = 3,
  seriesTotal = 4,
  carga = 100,
  repsTotal = 8,
  velocidades = [0.78, 0.71, 0.62, 0.55, 0.48, 0.42],
  objetivo = vbt.objetivoCorte,
  descanso = '1:32',
}) {
  const reps = velocidades.length;
  const mejor = Math.max(...velocidades);
  const ultima = velocidades[velocidades.length - 1];
  const caida = Math.round((1 - ultima / mejor) * 100);
  const bajas = velocidades.filter((v) => v < objetivo).length;
  const fmt = (v) => v.toFixed(2).replace('.', ',');

  return (
    <Pantalla>
      <Encabezado
        derecha={
          <PildoraVidrio>
            <IconoReloj />
            Descanso {descanso}
          </PildoraVidrio>
        }
      />

      <Tarjeta padding="16px 18px">
        <CabeceraEjercicio
          nombre="Serie terminada"
          detalle={`${ejercicio} · Serie ${serie} de ${seriesTotal} · ${carga} kg`}
        />
      </Tarjeta>

      <div
        style={{
          position: 'relative',
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: 10,
          flex: 'none',
        }}
      >
        <Tarjeta alta padding="16px 18px" gap={4}>
          <Cifra etiqueta="Reps" valor={reps} sufijo={`/ ${repsTotal}`} tam={44} />
        </Tarjeta>
        <Tarjeta alta padding="16px 18px" gap={4}>
          <Cifra etiqueta="Mejor rep" valor={fmt(mejor)} sufijo="m/s" tam={44} />
        </Tarjeta>
      </div>

      <Tarjeta alta padding="18px 18px 16px" gap={12}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ fontSize: texto.etiqueta, fontWeight: 600, color: color.textoSuave }}>
              Caída de velocidad
            </div>
            <DatoGrande valor={`−${caida}%`} unidad={null} tam={texto.datoMedio} alerta />
            <div style={{ fontSize: texto.etiqueta, fontWeight: 600, color: color.textoSuave }}>
              de {fmt(mejor)} a {fmt(ultima)} m/s
            </div>
          </div>
          <Disco tam={64} fondo={color.coralTenue} sombraPropia="none">
            <IconoCaida tam={28} />
          </Disco>
        </div>

        <GraficoReps
          velocidades={velocidades}
          objetivo={objetivo}
          alto={70}
          conValores={false}
        />

        <Aviso
          titulo="Cortá antes"
          detalle={`Las ${bajas === 2 ? 'dos' : bajas} últimas reps quedaron debajo de tu objetivo de corte de ${fmt(objetivo)} m/s.`}
          icono={<IconoAviso />}
        />
      </Tarjeta>

      <div
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          marginTop: 'auto',
          flex: 'none',
        }}
      >
        <Boton coral>Guardar serie</Boton>
        <Boton>Otra serie</Boton>
      </div>
    </Pantalla>
  );
}
