import React from 'react';
import { color, texto, radio, vbt } from '../tokens/tokens.js';
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
  Boton,
} from '../components/Controles.jsx';
import { Arco } from '../components/Graficos.jsx';
import { Simulado } from '../components/Formularios.jsx';
import {
  IconoMas3,
  IconoDetener,
  IconoPausa,
  IconoReiniciar,
  IconoCaida,
  IconoObjetivo,
  IconoOnda,
  IconoTilde,
  IconoBarras,
  IconoReloj,
} from '../components/Iconos.jsx';

// Encabezado común de las tres pantallas de la serie. El botón de la onda
// prende la voz: con auriculares puestos la app dice la velocidad de cada
// repetición, que es lo que permite no mirar el teléfono.
function CabezaSerie({ voz = false }) {
  return (
    <Encabezado
      derecha={
        <div style={{ display: 'flex', gap: 8 }}>
          <Disco
            tam={40}
            fondo={
              voz
                ? 'rgba(238,69,38,0.12)'
                : 'linear-gradient(180deg, rgba(255,255,255,0.95), rgba(255,255,255,0.65))'
            }
            borde={voz ? 'none' : '1px solid rgba(255,255,255,0.9)'}
            sombraPropia="inset 0 1px 0 rgba(255,255,255,1), 0 6px 16px -8px rgba(7,7,7,0.25)"
          >
            <IconoOnda c={voz ? color.coral : '#2A2926'} />
          </Disco>
          <Disco
            tam={40}
            fondo="linear-gradient(180deg, rgba(255,255,255,0.95), rgba(255,255,255,0.65))"
            borde="1px solid rgba(255,255,255,0.9)"
            sombraPropia="inset 0 1px 0 rgba(255,255,255,1), 0 6px 16px -8px rgba(7,7,7,0.25)"
          >
            <IconoMas3 />
          </Disco>
        </div>
      }
    />
  );
}

// EN VIVO — ESPERANDO LA PRIMERA REP. La barra está apoyada y el sensor ya
// calibró: la pantalla dice qué está esperando en vez de mostrar un cero, que
// se leería como una medición de cero.
export function SerieEsperando() {
  return (
    <Pantalla gap={10} abajo={18}>
      <CabezaSerie voz />

      <Tarjeta>
        <CabeceraEjercicio
          nombre="Press de banca"
          detalle="Sesión en vivo"
          derecha={<Pildora viva>En vivo</Pildora>}
        />
        <FilaCifras
          items={[
            { etiqueta: 'Serie', valor: 3, sufijo: '/ 4' },
            { etiqueta: 'Rep', valor: 0, sufijo: '/ 8' },
            { etiqueta: 'Carga', valor: 100, sufijo: 'kg' },
          ]}
        />
      </Tarjeta>

      <Tarjeta alta padding="30px 18px 26px" gap={14} estilo={{ alignItems: 'center' }}>
        <Arco progreso={1} valor="Listo" etiqueta="calibrado" tam={150} />
        <div
          style={{
            fontSize: texto.tituloCard,
            fontWeight: 800,
            letterSpacing: '-0.02em',
            textAlign: 'center',
          }}
        >
          Esperando la primera rep
        </div>
        <div
          style={{
            fontSize: texto.chico,
            fontWeight: 600,
            color: color.textoSuave,
            textAlign: 'center',
            lineHeight: 1.4,
            textWrap: 'pretty',
            maxWidth: 260,
            marginTop: -8,
          }}
        >
          Levantá cuando quieras. La cuenta arranca sola con el primer empuje.
        </div>
      </Tarjeta>

      <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', flex: 'none' }}>
        <Simulado />
      </div>

      <ControlesSerie
        izquierda={<BotonDisco icono={<IconoDetener />} etiqueta="Finalizar" />}
        centro={<BotonDisco icono={<IconoPausa />} etiqueta="Pausa" principal />}
        derecha={<BotonDisco icono={<IconoReiniciar />} etiqueta="Reiniciar serie" />}
      />
    </Pantalla>
  );
}

// EN VIVO — EN CURSO. Mismo lugar, mismo tamaño que el estado de corte: lo
// único que cambia es el color del número y el texto del aviso. Si la pantalla
// se reacomodara, habría que volver a leerla entera entre repeticiones.
export function SerieEnCurso({
  velocidades = [0.78, 0.71, 0.62],
  objetivo = vbt.objetivoCorte,
}) {
  const ultima = velocidades[velocidades.length - 1];
  const mejor = Math.max(...velocidades);
  const caida = Math.round((1 - ultima / mejor) * 100);
  const fmt = (v) => v.toFixed(2).replace('.', ',');

  return (
    <Pantalla gap={8} abajo={18}>
      <CabezaSerie voz />

      <Tarjeta>
        <CabeceraEjercicio
          nombre="Press de banca"
          detalle="Sesión en vivo"
          derecha={<Pildora viva>En vivo</Pildora>}
        />
        <FilaCifras
          items={[
            { etiqueta: 'Serie', valor: 3, sufijo: '/ 4' },
            { etiqueta: 'Rep', valor: velocidades.length, sufijo: '/ 8' },
            { etiqueta: 'Carga', valor: 100, sufijo: 'kg' },
          ]}
        />
      </Tarjeta>

      <Tarjeta alta padding="14px 12px 12px" gap={4} estilo={{ alignItems: 'center' }}>
        <div style={{ fontSize: texto.cuerpoFuerte, fontWeight: 800, letterSpacing: '-0.02em' }}>
          Última rep
        </div>
        <div style={{ marginTop: -6 }}>
          <DatoGrande valor={fmt(ultima)} />
        </div>
        <Aviso
          tono="neutro"
          icono={<IconoTilde tam={22} />}
          titulo="Seguí"
          detalle={`Todavía estás ${fmt(ultima - objetivo)} m/s por encima del corte.`}
        />
      </Tarjeta>

      <Tarjeta padding="12px 16px 10px" gap={8} estilo={{ borderRadius: radio.cardChica }}>
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

// EN VIVO — EN PAUSA. El número se apaga a gris: lo que se ve ya no es una
// lectura en curso. La serie no se pierde y se dice explícitamente.
export function SeriePausada({ velocidades = [0.78, 0.71, 0.62, 0.55] }) {
  const fmt = (v) => v.toFixed(2).replace('.', ',');
  return (
    <Pantalla gap={10} abajo={18}>
      <CabezaSerie />

      <Tarjeta>
        <CabeceraEjercicio
          nombre="Press de banca"
          detalle="Sesión en pausa"
          derecha={<Pildora>En pausa</Pildora>}
        />
        <FilaCifras
          items={[
            { etiqueta: 'Serie', valor: 3, sufijo: '/ 4' },
            { etiqueta: 'Rep', valor: velocidades.length, sufijo: '/ 8' },
            { etiqueta: 'Carga', valor: 100, sufijo: 'kg' },
          ]}
        />
      </Tarjeta>

      <Tarjeta alta padding="20px 14px 16px" gap={6} estilo={{ alignItems: 'center' }}>
        <div style={{ fontSize: texto.cuerpoFuerte, fontWeight: 800, color: color.textoSuave }}>
          Última rep
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: -4 }}>
          <span
            style={{
              fontSize: 82,
              fontWeight: 900,
              letterSpacing: '-0.06em',
              lineHeight: 0.95,
              color: '#B8B4AC',
            }}
          >
            {fmt(velocidades[velocidades.length - 1])}
          </span>
          <span style={{ fontSize: 19, fontWeight: 600, color: '#B8B4AC' }}>m/s</span>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '11px 14px',
            borderRadius: radio.interior,
            background: 'rgba(7,7,7,0.05)',
            width: '100%',
            boxSizing: 'border-box',
            marginTop: 6,
          }}
        >
          <IconoPausa tam={18} c={color.textoMedio} />
          <div style={{ fontSize: texto.chico, fontWeight: 700, lineHeight: 1.3 }}>
            Las {velocidades.length} reps están guardadas. Retomá cuando quieras.
          </div>
        </div>
      </Tarjeta>

      <Tarjeta padding="12px 16px 10px" gap={8} estilo={{ borderRadius: radio.cardChica }}>
        <TituloGrafico titulo="Velocidad por repetición" />
        <GraficoReps velocidades={velocidades} />
      </Tarjeta>

      <ControlesSerie
        izquierda={<BotonDisco icono={<IconoDetener />} etiqueta="Finalizar" />}
        centro={
          <BotonDisco
            principal
            etiqueta="Reanudar"
            icono={
              <svg width="30" height="30" viewBox="0 0 24 24" fill={color.coral}>
                <path d="M8 5.5v13l11-6.5z" />
              </svg>
            }
          />
        }
        derecha={<BotonDisco icono={<IconoReiniciar />} etiqueta="Reiniciar serie" />}
      />
    </Pantalla>
  );
}

// DESCANSO. Empieza solo al guardar la serie. El cronómetro es grande porque se
// mira de lejos, y abajo ya está lo que viene, para no tener que buscarlo cuando
// suene.
export function Descanso({ restante = '1:32', objetivo = '2:00' }) {
  return (
    <Pantalla gap={12}>
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

      <Tarjeta alta padding="26px 18px 22px" gap={10} estilo={{ alignItems: 'center' }}>
        <div style={{ fontSize: texto.etiqueta, fontWeight: 700, color: color.textoSuave }}>
          Descanso
        </div>
        <div
          style={{
            fontSize: 96,
            fontWeight: 900,
            letterSpacing: '-0.06em',
            lineHeight: 1,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {restante}
        </div>
        <div
          style={{
            width: '100%',
            height: 6,
            borderRadius: 999,
            background: 'rgba(7,7,7,0.10)',
            overflow: 'hidden',
            marginTop: 4,
          }}
        >
          <div style={{ width: '24%', height: '100%', background: color.coral }} />
        </div>
        <div style={{ fontSize: texto.minima, fontWeight: 600, color: color.textoSuave }}>
          de {objetivo} previstos
        </div>
      </Tarjeta>

      <Tarjeta padding="14px 16px" gap={12}>
        <div style={{ fontSize: texto.chico, fontWeight: 800 }}>Lo que viene</div>
        <CabeceraEjercicio
          nombre="Serie 4 de 4"
          detalle="Press de banca · 100 kg · 8 reps"
          derecha={<Pildora tenue>Última</Pildora>}
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
        <Boton coral>Empezar ahora</Boton>
        <Boton>+ 30 segundos</Boton>
      </div>
    </Pantalla>
  );
}
