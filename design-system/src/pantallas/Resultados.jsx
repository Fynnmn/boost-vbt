import React from 'react';
import { color, texto, radio } from '../tokens/tokens.js';
import { Pantalla, Tarjeta, Encabezado, Disco, BarraTitulo } from '../components/Superficies.jsx';
import { Cifra, GraficoReps, Aviso, Metrica, DatoGrande } from '../components/Datos.jsx';
import { Boton, Pildora, Fila, CabeceraEjercicio } from '../components/Controles.jsx';
import { MiniBarras, PerfilCargaVelocidad, Zonas } from '../components/Graficos.jsx';
import { Tabs, Vacio, Simulado } from '../components/Formularios.jsx';
import {
  IconoCaida,
  IconoReloj,
  IconoTilde,
  IconoBarra,
  IconoDescarga,
  IconoCalendario,
  IconoAyuda,
  IconoBarras,
  IconoRayo,
} from '../components/Iconos.jsx';

// RESUMEN DE SESIÓN. Al terminar el entrenamiento entero. Lo que importa no es
// el volumen total —eso lo da cualquier app— sino si la sesión se sostuvo o se
// fue cayendo serie a serie.
export function ResumenSesion() {
  const series = [
    { n: 1, carga: 95, v: [0.85, 0.82, 0.78, 0.74, 0.71, 0.68, 0.64, 0.61] },
    { n: 2, carga: 100, v: [0.8, 0.74, 0.68, 0.61, 0.55, 0.5] },
    { n: 3, carga: 100, v: [0.78, 0.71, 0.62, 0.55, 0.48, 0.42] },
    { n: 4, carga: 100, v: [0.72, 0.64, 0.55, 0.47] },
  ];
  return (
    <Pantalla gap={10}>
      <BarraTitulo titulo="Sesión terminada" cerrar />

      <Tarjeta alta padding="18px 18px 16px" gap={12}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div style={{ fontSize: texto.etiqueta, fontWeight: 700, color: color.textoSuave }}>
            Empuje pesado · 48 min
          </div>
          <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: '-0.035em' }}>
            Press de banca
          </div>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gap: 0,
          }}
        >
          {[
            { etiqueta: 'Series', valor: '4' },
            { etiqueta: 'Reps', valor: '24' },
            { etiqueta: 'Volumen', valor: '2,4', sufijo: 't' },
          ].map((c, i) => (
            <div
              key={c.etiqueta}
              style={{
                padding: i === 0 ? '0 8px 0 0' : '0 8px 0 14px',
                borderLeft: i === 0 ? 'none' : `1px solid ${color.linea}`,
              }}
            >
              <Cifra {...c} tam={28} />
            </div>
          ))}
        </div>
      </Tarjeta>

      <Tarjeta padding="14px 16px" gap={12}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: texto.chico, fontWeight: 800 }}>Serie por serie</div>
          <span style={{ fontSize: texto.minima, fontWeight: 600, color: color.textoSuave }}>
            velocidad de cada rep
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {series.map((s) => {
            const mejor = Math.max(...s.v);
            const caida = Math.round((1 - s.v[s.v.length - 1] / mejor) * 100);
            return (
              <div key={s.n} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    width: 26,
                    fontSize: texto.etiqueta,
                    fontWeight: 800,
                    color: color.textoSuave,
                  }}
                >
                  S{s.n}
                </div>
                <MiniBarras velocidades={s.v} alto={32} />
                <div style={{ flex: 1 }} />
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 14, fontWeight: 800 }}>{s.carga} kg</div>
                  <div
                    style={{
                      fontSize: texto.minima,
                      fontWeight: 700,
                      color: caida >= 20 ? color.coral : color.textoSuave,
                    }}
                  >
                    −{caida}%
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Tarjeta>

      <Tarjeta padding="14px 16px" gap={10} estilo={{ borderRadius: radio.cardChica }}>
        <Aviso
          icono={<IconoCaida />}
          titulo="La sesión se fue cayendo"
          detalle="La cuarta serie arrancó 0,06 m/s más lenta que la tercera: la próxima vez, descansá más entre series o cortá en tres."
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
        <Boton coral>Guardar sesión</Boton>
      </div>
    </Pantalla>
  );
}

// HISTORIAL. Lista por fecha. Cada fila trae la forma de la sesión en miniatura,
// que es lo que se compara de un vistazo; el detalle está a un toque.
export function Historial() {
  const dias = [
    {
      fecha: 'Hoy',
      sesiones: [
        { e: 'Press de banca', d: '4 series · 24 reps · 100 kg', v: [0.78, 0.71, 0.62, 0.55, 0.48, 0.42], c: -46 },
      ],
    },
    {
      fecha: 'Sábado 13 de septiembre',
      sesiones: [
        { e: 'Sentadilla', d: '5 series · 30 reps · 120 kg', v: [0.72, 0.68, 0.63, 0.58, 0.54], c: -25 },
        { e: 'Peso muerto', d: '3 series · 12 reps · 140 kg', v: [0.62, 0.56, 0.5, 0.44], c: -29 },
      ],
    },
    {
      fecha: 'Miércoles 10 de septiembre',
      sesiones: [
        { e: 'Press de banca', d: '4 series · 21 reps · 97,5 kg', v: [0.8, 0.74, 0.66, 0.57, 0.49], c: -39 },
      ],
    },
  ];
  return (
    <Pantalla gap={10}>
      <Encabezado
        derecha={
          <Disco
            tam={40}
            fondo="linear-gradient(180deg, rgba(255,255,255,0.95), rgba(255,255,255,0.65))"
            borde="1px solid rgba(255,255,255,0.9)"
            sombraPropia="inset 0 1px 0 rgba(255,255,255,1), 0 6px 16px -8px rgba(7,7,7,0.25)"
          >
            <IconoDescarga tam={18} />
          </Disco>
        }
      />

      <div style={{ position: 'relative', display: 'flex', gap: 7, flex: 'none' }}>
        <Pildora tenue>Todo</Pildora>
        <Pildora>Banca</Pildora>
        <Pildora>Sentadilla</Pildora>
        <Pildora>30 días</Pildora>
      </div>

      <div
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          overflow: 'hidden',
          flex: 1,
        }}
      >
        {dias.map((d) => (
          <div key={d.fecha} style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <div
              style={{
                fontSize: texto.minima,
                fontWeight: 800,
                color: color.textoSuave,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                paddingLeft: 6,
              }}
            >
              {d.fecha}
            </div>
            <Tarjeta padding="10px 12px" gap={8}>
              {d.sesiones.map((s) => (
                <Fila
                  key={s.e + s.d}
                  icono={<IconoBarra tam={20} />}
                  titulo={s.e}
                  detalle={s.d}
                  derecha={
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <MiniBarras velocidades={s.v} alto={26} gap={2} />
                      <span
                        style={{
                          fontSize: texto.etiqueta,
                          fontWeight: 800,
                          color: s.c <= -40 ? color.coral : color.textoMedio,
                          width: 34,
                          textAlign: 'right',
                        }}
                      >
                        {s.c}%
                      </span>
                    </div>
                  }
                />
              ))}
            </Tarjeta>
          </div>
        ))}
      </div>

      <Tabs activa="historial" />
    </Pantalla>
  );
}

// DETALLE DE UNA SESIÓN DEL HISTORIAL. Es el resumen de sesión pero mirado en
// frío, con la fecha y la posibilidad de exportar los datos crudos.
export function DetalleSesion() {
  return (
    <Pantalla gap={10}>
      <BarraTitulo
        titulo="Martes 16 · 19:40"
        derecha={
          <Disco tam={40} fondo="rgba(255,255,255,0.7)" borde="1px solid rgba(255,255,255,0.9)">
            <IconoDescarga tam={18} />
          </Disco>
        }
      />

      <Tarjeta padding="14px 18px" gap={12}>
        <CabeceraEjercicio
          nombre="Press de banca"
          detalle="Empuje pesado · 48 min"
          derecha={<Pildora tenue>100 kg</Pildora>}
        />
      </Tarjeta>

      <Tarjeta alta padding="16px 18px" gap={12}>
        <div style={{ fontSize: texto.chico, fontWeight: 800 }}>Serie 3 · la que cortaste</div>
        <GraficoReps velocidades={[0.78, 0.71, 0.62, 0.55, 0.48, 0.42]} />
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
        <Metrica etiqueta="Mejor rep" valor="0,78" unidad="m/s" icono={<IconoRayo tam={17} />} />
        <Metrica
          etiqueta="Caída máxima"
          valor="−46%"
          icono={<IconoCaida />}
          tono="alerta"
        />
      </div>

      <Tarjeta padding="14px 16px" gap={10} estilo={{ borderRadius: radio.cardChica }}>
        <div style={{ fontSize: texto.chico, fontWeight: 800 }}>Zona de trabajo</div>
        <Zonas velocidad={0.6} />
        <div
          style={{
            fontSize: texto.minima,
            fontWeight: 600,
            color: color.textoSuave,
            lineHeight: 1.4,
            textWrap: 'pretty',
          }}
        >
          La media de la sesión cayó en fuerza: es la zona que buscabas para un
          día de empuje pesado.
        </div>
      </Tarjeta>

      <Tarjeta padding="14px 16px" gap={10} estilo={{ borderRadius: radio.cardChica }}>
        <div style={{ fontSize: texto.chico, fontWeight: 800 }}>Las cuatro series</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {[
            { n: 1, carga: 95, v: [0.85, 0.82, 0.78, 0.74, 0.71, 0.68, 0.64, 0.61], c: -28 },
            { n: 2, carga: 100, v: [0.8, 0.74, 0.68, 0.61, 0.55, 0.5], c: -38 },
            { n: 3, carga: 100, v: [0.78, 0.71, 0.62, 0.55, 0.48, 0.42], c: -46 },
            { n: 4, carga: 100, v: [0.72, 0.64, 0.55, 0.47], c: -35 },
          ].map((s) => (
            <div key={s.n} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span
                style={{
                  width: 22,
                  fontSize: texto.minima,
                  fontWeight: 800,
                  color: color.textoSuave,
                }}
              >
                S{s.n}
              </span>
              <MiniBarras velocidades={s.v} alto={26} gap={2} />
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: texto.etiqueta, fontWeight: 700, color: color.textoSuave }}>
                {s.carga} kg
              </span>
              <span
                style={{
                  fontSize: texto.etiqueta,
                  fontWeight: 800,
                  width: 36,
                  textAlign: 'right',
                  color: s.c <= -40 ? color.coral : color.textoMedio,
                }}
              >
                {s.c}%
              </span>
            </div>
          ))}
        </div>
      </Tarjeta>

      <div
        style={{
          position: 'relative',
          display: 'flex',
          justifyContent: 'center',
          flex: 'none',
          marginTop: 'auto',
        }}
      >
        <Simulado />
      </div>
    </Pantalla>
  );
}

// PERFIL CARGA-VELOCIDAD. La pantalla más delicada de la app: de acá sale un
// 1RM estimado, que es un número que la gente se cree. Por eso nunca va solo —
// siempre con r², con la cantidad de series y con el rango de cargas — y el
// texto dice en criollo qué tan confiable es.
export function PerfilVelocidad() {
  return (
    <Pantalla gap={10}>
      <Encabezado
        derecha={
          <Disco
            tam={40}
            fondo="linear-gradient(180deg, rgba(255,255,255,0.95), rgba(255,255,255,0.65))"
            borde="1px solid rgba(255,255,255,0.9)"
            sombraPropia="inset 0 1px 0 rgba(255,255,255,1), 0 6px 16px -8px rgba(7,7,7,0.25)"
          >
            <IconoAyuda tam={18} />
          </Disco>
        }
      />

      <div style={{ position: 'relative', display: 'flex', gap: 7, flex: 'none' }}>
        <Pildora tenue>Press de banca</Pildora>
        <Pildora>Sentadilla</Pildora>
        <Pildora>Peso muerto</Pildora>
      </div>

      <Tarjeta alta padding="16px 18px 14px" gap={10}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ fontSize: texto.etiqueta, fontWeight: 700, color: color.textoSuave }}>
              1RM estimado
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
              <span
                style={{ fontSize: 52, fontWeight: 900, letterSpacing: '-0.05em', lineHeight: 1 }}
              >
                124
              </span>
              <span style={{ fontSize: 19, fontWeight: 600, color: color.textoSuave }}>kg</span>
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              height: 28,
              padding: '0 11px',
              borderRadius: 999,
              background: 'rgba(53,199,122,0.12)',
            }}
          >
            <IconoTilde tam={14} />
            <span style={{ fontSize: texto.minima, fontWeight: 800 }}>Confiable</span>
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            gap: 14,
            paddingTop: 2,
            fontSize: texto.minima,
            fontWeight: 700,
            color: color.textoSuave,
          }}
        >
          <span>r² 0,97</span>
          <span>·</span>
          <span>12 series</span>
          <span>·</span>
          <span>60 a 100 kg</span>
        </div>
      </Tarjeta>

      <Tarjeta padding="14px 16px 10px" gap={8}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: texto.chico, fontWeight: 800 }}>Carga contra velocidad</div>
          <span style={{ fontSize: 10, fontWeight: 600, color: color.textoSuave }}>
            m/s por kg
          </span>
        </div>
        <PerfilCargaVelocidad />
      </Tarjeta>

      <Tarjeta padding="13px 16px" gap={0} estilo={{ borderRadius: radio.cardChica }}>
        <div
          style={{
            fontSize: texto.minima,
            fontWeight: 600,
            color: color.textoMedio,
            lineHeight: 1.45,
            textWrap: 'pretty',
          }}
        >
          El 1RM sale de estirar la recta hasta 0,15 m/s, no de una prueba real.
          Con 12 series entre 60 y 100 kg la recta apoya bien; si entrenás
          siempre con la misma carga, el número deja de valer.
        </div>
      </Tarjeta>

      <Tabs activa="perfil" />
    </Pantalla>
  );
}

// HISTORIAL VACÍO. Primera vez. No una pantalla en blanco: dice qué falta y
// cuál es el paso siguiente.
export function HistorialVacio() {
  return (
    <Pantalla gap={12}>
      <Encabezado />
      <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
        <Vacio
          icono={<IconoCalendario tam={32} c="#8A877F" />}
          titulo="Todavía no hay sesiones"
          detalle="Cuando termines tu primera serie con el sensor, va a aparecer acá con la velocidad de cada repetición."
          accion={
            <div style={{ width: '100%', marginTop: 8 }}>
              <Boton coral>Comenzar sesión</Boton>
            </div>
          }
        />
      </div>
      <Tabs activa="historial" />
    </Pantalla>
  );
}
