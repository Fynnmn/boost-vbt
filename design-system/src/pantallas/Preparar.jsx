import React from 'react';
import { color, texto, radio } from '../tokens/tokens.js';
import { Pantalla, Tarjeta, Encabezado, Disco, BarraTitulo } from '../components/Superficies.jsx';
import { Boton, Fila, Pildora, SelectorCarga, CabeceraEjercicio } from '../components/Controles.jsx';
import { Cifra, GraficoReps } from '../components/Datos.jsx';
import { MiniBarras, Zonas, Bateria } from '../components/Graficos.jsx';
import { Tabs, Simulado, Campo } from '../components/Formularios.jsx';
import {
  IconoBarra,
  IconoBuscar,
  IconoTilde,
  IconoObjetivo,
  IconoOnda,
  IconoMas,
  IconoBluetooth,
} from '../components/Iconos.jsx';

// INICIO. La pantalla a la que se vuelve entre sesiones: qué toca hoy, el estado
// del sensor, y lo último que hiciste de ese ejercicio para saber con qué carga
// arrancar. Un botón grande y nada más que decidir.
export function Inicio() {
  return (
    <Pantalla gap={10}>
      <Encabezado
        derecha={
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              height: 40,
              padding: '0 14px',
              borderRadius: 999,
              background: 'linear-gradient(180deg, rgba(255,255,255,0.95), rgba(255,255,255,0.65))',
              border: '1px solid rgba(255,255,255,0.9)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,1), 0 6px 16px -8px rgba(7,7,7,0.25)',
            }}
          >
            <IconoBluetooth tam={15} />
            <Bateria nivel={87} ancho={26} />
          </div>
        }
      />

      <Tarjeta alta padding="18px 18px 16px" gap={14}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div style={{ fontSize: texto.etiqueta, fontWeight: 700, color: color.textoSuave }}>
            Martes 16 de septiembre
          </div>
          <div style={{ fontSize: 27, fontWeight: 900, letterSpacing: '-0.035em', lineHeight: 1.1 }}>
            Empuje pesado
          </div>
        </div>
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
          <Pildora>Press de banca</Pildora>
          <Pildora>Press militar</Pildora>
          <Pildora>Fondos</Pildora>
        </div>
        <Boton coral>Comenzar sesión</Boton>
      </Tarjeta>

      <Tarjeta padding="14px 16px" gap={12} estilo={{ borderRadius: radio.cardChica }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: texto.chico, fontWeight: 800 }}>La última vez</div>
          <span style={{ fontSize: texto.minima, fontWeight: 600, color: color.textoSuave }}>
            hace 3 días
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <MiniBarras velocidades={[0.8, 0.74, 0.66, 0.57, 0.49]} alto={38} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 800 }}>Press de banca · 97,5 kg</div>
            <div style={{ fontSize: texto.minima, fontWeight: 600, color: color.textoSuave }}>
              5 reps · cortaste en −39 %
            </div>
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '11px 13px',
            borderRadius: radio.fila,
            background: 'rgba(53,199,122,0.10)',
          }}
        >
          <IconoTilde tam={18} />
          <div style={{ fontSize: texto.chico, fontWeight: 700, lineHeight: 1.3 }}>
            Subí a 100 kg: la primera rep pasó tu objetivo por bastante.
          </div>
        </div>
      </Tarjeta>

      <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', flex: 'none' }}>
        <Simulado />
      </div>

      <Tabs activa="entrenar" />
    </Pantalla>
  );
}

// ELEGIR EJERCICIO. Lista vertical y buscador. Cada fila trae la velocidad
// objetivo del ejercicio, que no es la misma para todos: 0,50 m/s en banca no
// significa lo mismo que en sentadilla.
export function ElegirEjercicio() {
  const lista = [
    { n: 'Press de banca', v: '0,50 m/s', u: '100 kg', activo: true },
    { n: 'Sentadilla', v: '0,55 m/s', u: '120 kg' },
    { n: 'Peso muerto', v: '0,45 m/s', u: '140 kg' },
    { n: 'Press militar', v: '0,52 m/s', u: '55 kg' },
    { n: 'Remo con barra', v: '0,60 m/s', u: '70 kg' },
    { n: 'Hip thrust', v: '0,50 m/s', u: '130 kg' },
  ];
  return (
    <Pantalla gap={12}>
      <BarraTitulo titulo="Ejercicio" derecha={<Disco tam={40} fondo="rgba(255,255,255,0.7)"><IconoMas tam={18} /></Disco>} />

      <Campo marcador="Buscar ejercicio" icono={<IconoBuscar />} />

      <Tarjeta padding="10px 12px" gap={8} estilo={{ overflow: 'hidden' }}>
        {lista.map((e) => (
          <Fila
            key={e.n}
            activa={e.activo}
            icono={<IconoBarra tam={20} c={e.activo ? color.coral : '#2A2926'} />}
            titulo={e.n}
            detalle={`Objetivo ${e.v} · última carga ${e.u}`}
            derecha={e.activo ? <IconoTilde tam={19} c={color.coral} /> : undefined}
          />
        ))}
      </Tarjeta>

      <div style={{ position: 'relative', marginTop: 'auto', flex: 'none' }}>
        <Boton coral>Seguir</Boton>
      </div>
    </Pantalla>
  );
}

// ARMAR LA SERIE. Carga, reps previstas y la velocidad que deberías ver si la
// carga está bien elegida. Ese dato de arriba es lo que convierte la pantalla en
// una decisión y no en un formulario.
export function ArmarSerie() {
  return (
    <Pantalla gap={10}>
      <BarraTitulo titulo="Serie 3 de 4" />

      <Tarjeta padding="14px 18px" gap={12}>
        <CabeceraEjercicio
          nombre="Press de banca"
          detalle="Empuje pesado · hoy"
          derecha={<Pildora tenue>Serie 3</Pildora>}
        />
      </Tarjeta>

      <SelectorCarga valor={100} />

      <div
        style={{
          position: 'relative',
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: 10,
          flex: 'none',
        }}
      >
        <Tarjeta padding="14px 16px" gap={4}>
          <Cifra etiqueta="Reps previstas" valor="8" tam={30} />
        </Tarjeta>
        <Tarjeta padding="14px 16px" gap={4}>
          <Cifra etiqueta="Velocidad esperada" valor="0,72" sufijo="m/s" tam={30} />
        </Tarjeta>
      </div>

      <Tarjeta padding="14px 16px" gap={10} estilo={{ borderRadius: radio.cardChica }}>
        <div style={{ fontSize: texto.chico, fontWeight: 800 }}>Zona de trabajo</div>
        <Zonas velocidad={0.72} />
      </Tarjeta>

      <div style={{ position: 'relative', marginTop: 'auto', flex: 'none' }}>
        <Boton coral>Comenzar serie</Boton>
      </div>
    </Pantalla>
  );
}

// OBJETIVO DE CORTE. Se puede fijar de dos maneras y la pantalla lo dice claro:
// por pérdida respecto de la mejor repetición (lo habitual) o por una velocidad
// fija. El texto explica qué significa cada una en vez de dejar dos casillas.
export function ObjetivoCorte({ modo = 'perdida' }) {
  return (
    <Pantalla gap={12}>
      <BarraTitulo titulo="Objetivo de corte" />

      <Tarjeta alta padding="18px 18px 16px" gap={14}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontSize: texto.etiqueta, fontWeight: 700, color: color.textoSuave }}>
            Cortar cuando la velocidad caiga
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span
              style={{
                fontSize: 64,
                fontWeight: 900,
                letterSpacing: '-0.06em',
                lineHeight: 1,
                color: color.coral,
              }}
            >
              20
            </span>
            <span style={{ fontSize: 24, fontWeight: 700, color: color.textoSuave }}>%</span>
          </div>
        </div>

        <div style={{ position: 'relative', height: 30 }}>
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: 13,
              height: 6,
              borderRadius: 999,
              background: 'rgba(7,7,7,0.10)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: 0,
              width: '46%',
              top: 13,
              height: 6,
              borderRadius: 999,
              background: color.coral,
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: '46%',
              top: 2,
              width: 28,
              height: 28,
              marginLeft: -14,
              borderRadius: '50%',
              background: '#fff',
              border: `2px solid ${color.coral}`,
              boxShadow: '0 4px 12px -2px rgba(7,7,7,0.3)',
            }}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          {['10 %', '20 %', '30 %', '40 %'].map((t) => (
            <span key={t} style={{ fontSize: 10.5, fontWeight: 700, color: color.textoSuave }}>
              {t}
            </span>
          ))}
        </div>
      </Tarjeta>

      <Tarjeta padding="14px 16px" gap={10}>
        <div style={{ fontSize: texto.chico, fontWeight: 800 }}>Con tu última serie</div>
        <GraficoReps velocidades={[0.78, 0.71, 0.62, 0.55, 0.48, 0.42]} objetivo={0.624} />
        <div
          style={{
            fontSize: texto.minima,
            fontWeight: 600,
            color: color.textoSuave,
            lineHeight: 1.4,
            textWrap: 'pretty',
          }}
        >
          Un 20 % de pérdida sobre una mejor rep de 0,78 m/s corta en 0,62 m/s:
          habrías terminado en la repetición 3.
        </div>
      </Tarjeta>

      <Tarjeta padding="6px 16px" gap={0}>
        {[
          { t: 'Por pérdida', d: 'Se calcula contra la mejor rep de cada serie', on: modo === 'perdida' },
          { t: 'Por velocidad fija', d: 'Siempre el mismo número, sin importar el día', on: modo !== 'perdida' },
        ].map((o, i, arr) => (
          <div
            key={o.t}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '13px 2px',
              borderBottom: i === arr.length - 1 ? 'none' : `1px solid ${color.linea}`,
            }}
          >
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                flex: 'none',
                border: `2px solid ${o.on ? color.coral : 'rgba(7,7,7,0.2)'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {o.on ? (
                <div
                  style={{ width: 11, height: 11, borderRadius: '50%', background: color.coral }}
                />
              ) : null}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{o.t}</div>
              <div style={{ fontSize: texto.minima, fontWeight: 600, color: color.textoSuave }}>
                {o.d}
              </div>
            </div>
          </div>
        ))}
      </Tarjeta>

      <div style={{ position: 'relative', marginTop: 'auto', flex: 'none' }}>
        <Boton coral>Guardar</Boton>
      </div>
    </Pantalla>
  );
}
