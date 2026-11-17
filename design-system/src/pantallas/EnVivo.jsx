import React from 'react';
import { color, texto, vbt } from '../tokens/tokens.js';
import { Pantalla, Tarjeta, Encabezado, Disco } from '../components/Superficies.jsx';
import {
  DatoGrande,
  FilaCifras,
  Aviso,
  Metrica,
  GraficoReps,
  TituloGrafico,
} from '../components/Datos.jsx';
import {
  BotonDisco,
  ControlesSerie,
  Pildora,
  CabeceraEjercicio,
} from '../components/Controles.jsx';
import {
  IconoMas3,
  IconoDetener,
  IconoPausa,
  IconoReiniciar,
  IconoCaida,
  IconoObjetivo,
} from '../components/Iconos.jsx';

// LA SERIE EN VIVO. Es la pantalla que se mira dos segundos, de pie, entre
// repeticiones: primero el número, después la decisión, y recién al final la
// serie entera. Los tres estados (en curso, cortá, en pausa) comparten la misma
// geometría — el número no cambia de lugar ni de tamaño, solo de color.
export function EnVivo({
  ejercicio = 'Press de banca',
  serie = 3,
  seriesTotal = 4,
  rep = 6,
  repsTotal = 8,
  carga = 100,
  velocidades = [0.78, 0.71, 0.62, 0.55, 0.48, 0.42],
  objetivo = vbt.objetivoCorte,
}) {
  const ultima = velocidades[velocidades.length - 1];
  const mejor = Math.max(...velocidades);
  const caida = Math.round((1 - ultima / mejor) * 100);
  const cortar = ultima < objetivo;
  const fmt = (v) => v.toFixed(2).replace('.', ',');

  return (
    <Pantalla gap={8} abajo={18}>
      <Encabezado
        derecha={
          <Disco
            tam={40}
            fondo="linear-gradient(180deg, rgba(255,255,255,0.95), rgba(255,255,255,0.65))"
            borde="1px solid rgba(255,255,255,0.9)"
            sombraPropia="inset 0 1px 0 rgba(255,255,255,1), 0 6px 16px -8px rgba(7,7,7,0.25)"
          >
            <IconoMas3 />
          </Disco>
        }
      />

      <Tarjeta>
        <CabeceraEjercicio
          nombre={ejercicio}
          detalle="Sesión en vivo"
          derecha={<Pildora viva>En vivo</Pildora>}
        />
        <FilaCifras
          items={[
            { etiqueta: 'Serie', valor: serie, sufijo: `/ ${seriesTotal}` },
            { etiqueta: 'Rep', valor: rep, sufijo: `/ ${repsTotal}` },
            { etiqueta: 'Carga', valor: carga, sufijo: 'kg' },
          ]}
        />
      </Tarjeta>

      <Tarjeta alta padding="14px 12px 12px" gap={4} estilo={{ alignItems: 'center' }}>
        <div style={{ fontSize: texto.cuerpoFuerte, fontWeight: 800, letterSpacing: '-0.02em' }}>
          Última rep
        </div>
        <div style={{ marginTop: -6 }}>
          <DatoGrande valor={fmt(ultima)} alerta={cortar} />
        </div>
        {cortar ? (
          <Aviso
            titulo="Cortá la serie"
            detalle="La velocidad ya está por debajo de tu objetivo de corte."
          />
        ) : (
          <Aviso
            titulo="Seguí"
            detalle={`Te quedan ${repsTotal - rep} reps antes de llegar al objetivo.`}
            tono="neutro"
          />
        )}
      </Tarjeta>

      <Tarjeta padding="12px 16px 10px" gap={8} estilo={{ borderRadius: 24 }}>
        <TituloGrafico titulo="Velocidad por repetición" objetivo={objetivo} />
        <GraficoReps velocidades={velocidades} objetivo={objetivo} />
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
        <Metrica
          etiqueta="Caída de velocidad"
          valor={`−${caida}%`}
          pie="vs. primera rep"
          icono={<IconoCaida />}
          tono="alerta"
        />
        <Metrica
          etiqueta="Objetivo de corte"
          valor={fmt(objetivo)}
          unidad="m/s"
          icono={<IconoObjetivo />}
        />
      </div>

      <ControlesSerie
        izquierda={<BotonDisco icono={<IconoDetener />} etiqueta="Finalizar" />}
        centro={<BotonDisco icono={<IconoPausa />} etiqueta="Pausa" principal />}
        derecha={<BotonDisco icono={<IconoReiniciar />} etiqueta="Reiniciar serie" />}
      />
    </Pantalla>
  );
}
