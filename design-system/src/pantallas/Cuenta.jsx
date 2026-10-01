import React from 'react';
import { color, texto, radio } from '../tokens/tokens.js';
import { Pantalla, Tarjeta, Encabezado, Disco, BarraTitulo } from '../components/Superficies.jsx';
import { Boton, Pildora, Fila } from '../components/Controles.jsx';
import { Bateria } from '../components/Graficos.jsx';
import {
  Tabs,
  GrupoAjustes,
  FilaAjuste,
  Interruptor,
  Simulado,
} from '../components/Formularios.jsx';
import {
  IconoUsuario,
  IconoCampana,
  IconoDescarga,
  IconoAyuda,
  IconoEscudo,
  IconoSalir,
  IconoOnda,
  IconoObjetivo,
  IconoRegla,
  IconoBluetooth,
  IconoTilde,
  IconoBarra,
  IconoRayo,
} from '../components/Iconos.jsx';

// CUENTA. El perfil de la persona, no el del sensor. Arriba quién sos y desde
// cuándo; abajo lo que se puede tocar, agrupado por a qué pertenece.
export function Cuenta() {
  return (
    <Pantalla gap={10}>
      <Encabezado />

      <Tarjeta alta padding="18px 18px" gap={14}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Disco tam={62} fondo="linear-gradient(180deg, #ECEAE4, #DEDBD3)">
            <span style={{ fontSize: 24, fontWeight: 900, letterSpacing: '-0.03em' }}>MF</span>
          </Disco>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 21, fontWeight: 900, letterSpacing: '-0.03em' }}>
              Máximo Fynn
            </div>
            <div style={{ fontSize: texto.etiqueta, fontWeight: 600, color: color.textoSuave }}>
              maximo@ejemplo.com
            </div>
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
            { e: 'Sesiones', v: '34' },
            { e: 'Series', v: '148' },
            { e: 'Desde', v: 'jul' },
          ].map((c, i) => (
            <div
              key={c.e}
              style={{
                padding: i === 0 ? '0 8px 0 0' : '0 8px 0 14px',
                borderLeft: i === 0 ? 'none' : `1px solid ${color.linea}`,
                display: 'flex',
                flexDirection: 'column',
                gap: 3,
              }}
            >
              <span style={{ fontSize: texto.minima, fontWeight: 600, color: color.textoSuave }}>
                {c.e}
              </span>
              <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.03em' }}>
                {c.v}
              </span>
            </div>
          ))}
        </div>
      </Tarjeta>

      <GrupoAjustes titulo="Sensor">
        <FilaAjuste
          icono={<IconoBluetooth tam={17} c="#2A2926" />}
          titulo="BOOST 3F2A"
          detalle="Conectado · firmware 0.4.1"
          derecha={<Bateria nivel={87} ancho={28} />}
        />
        <FilaAjuste
          icono={<IconoRegla tam={17} />}
          titulo="Umbrales y sensibilidad"
          detalle="Ajuste fino de la detección de repeticiones"
        />
        <FilaAjuste
          icono={<IconoDescarga tam={17} />}
          titulo="Descargar el registro interno"
          detalle="Para revisar una sesión rep por rep"
          ultima
        />
      </GrupoAjustes>

      <GrupoAjustes titulo="Entrenamiento">
        <FilaAjuste
          icono={<IconoObjetivo tam={17} />}
          titulo="Objetivo de corte"
          detalle="20 % de pérdida"
        />
        <FilaAjuste
          icono={<IconoOnda tam={17} />}
          titulo="Voz en los auriculares"
          derecha={<Interruptor encendido />}
        />
        <FilaAjuste
          icono={<IconoCampana tam={17} />}
          titulo="Avisar al terminar el descanso"
          derecha={<Interruptor encendido />}
          ultima
        />
      </GrupoAjustes>

      <Tabs activa="cuenta" />
    </Pantalla>
  );
}

// AJUSTES DEL SENSOR. La pantalla que se usa una vez, en el gimnasio, cuando el
// conteo no cierra. Cada parámetro dice qué pasa si se sube y qué pasa si se
// baja: un número sin consecuencia no se puede calibrar a ciegas.
export function AjustesSensor() {
  return (
    <Pantalla gap={12}>
      <BarraTitulo titulo="Umbrales" />

      <Tarjeta padding="14px 16px" gap={10} estilo={{ borderRadius: radio.cardChica }}>
        <div
          style={{
            fontSize: texto.minima,
            fontWeight: 600,
            color: color.textoMedio,
            lineHeight: 1.45,
            textWrap: 'pretty',
          }}
        >
          Esto se toca solo si el conteo falla. Los valores se guardan en el
          sensor, no en el teléfono, y quedan aunque cambies de celular.
        </div>
      </Tarjeta>

      {[
        {
          t: 'Umbral de arranque',
          v: '0,18 m/s',
          d: 'Más bajo cuenta reps más suaves; demasiado bajo cuenta el reacomodo de la barra.',
          p: 0.38,
        },
        {
          t: 'Recorrido mínimo',
          v: '12 cm',
          d: 'Más alto descarta los medios recorridos; demasiado alto se come las últimas reps.',
          p: 0.55,
        },
        {
          t: 'Pausa entre reps',
          v: '0,4 s',
          d: 'Separa dos repeticiones seguidas de un rebote en el pecho.',
          p: 0.3,
        },
      ].map((s) => (
        <Tarjeta key={s.t} padding="14px 16px" gap={10}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 15, fontWeight: 800 }}>{s.t}</div>
            <div
              style={{
                fontSize: 15,
                fontWeight: 800,
                color: color.coral,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {s.v}
            </div>
          </div>
          <div style={{ position: 'relative', height: 26 }}>
            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: 11,
                height: 5,
                borderRadius: 999,
                background: 'rgba(7,7,7,0.10)',
              }}
            />
            <div
              style={{
                position: 'absolute',
                left: 0,
                width: `${s.p * 100}%`,
                top: 11,
                height: 5,
                borderRadius: 999,
                background: color.coral,
              }}
            />
            <div
              style={{
                position: 'absolute',
                left: `${s.p * 100}%`,
                top: 1,
                width: 24,
                height: 24,
                marginLeft: -12,
                borderRadius: '50%',
                background: '#fff',
                border: `2px solid ${color.coral}`,
                boxShadow: '0 4px 10px -2px rgba(7,7,7,0.3)',
              }}
            />
          </div>
          <div
            style={{
              fontSize: texto.minima,
              fontWeight: 600,
              color: color.textoSuave,
              lineHeight: 1.4,
              textWrap: 'pretty',
            }}
          >
            {s.d}
          </div>
        </Tarjeta>
      ))}

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
        <Boton coral>Guardar en el sensor</Boton>
        <Boton>Volver a los valores de fábrica</Boton>
      </div>
    </Pantalla>
  );
}

// VOZ / MANOS LIBRES. La función que permite no mirar el teléfono. La pantalla
// dice qué se escucha exactamente, porque una voz que dice de más en el
// gimnasio se apaga y no se vuelve a prender.
export function Voz() {
  return (
    <Pantalla gap={12}>
      <BarraTitulo titulo="Voz" />

      <Tarjeta alta padding="26px 22px 22px" gap={12} estilo={{ alignItems: 'center' }}>
        <Disco tam={92} fondo={color.coralTenue} sombraPropia="none">
          <IconoOnda tam={42} c={color.coral} trazo={2} />
        </Disco>
        <div
          style={{
            fontSize: texto.titulo,
            fontWeight: 900,
            letterSpacing: '-0.03em',
            textAlign: 'center',
            marginTop: 4,
          }}
        >
          No mires el teléfono
        </div>
        <div
          style={{
            fontSize: texto.cuerpo,
            fontWeight: 600,
            color: color.textoSuave,
            textAlign: 'center',
            lineHeight: 1.4,
            textWrap: 'pretty',
            maxWidth: 285,
          }}
        >
          Con auriculares puestos, la app dice la velocidad de cada repetición y
          avisa una vez cuando cruzaste el corte.
        </div>
      </Tarjeta>

      <Tarjeta padding="14px 16px" gap={10}>
        <div style={{ fontSize: texto.chico, fontWeight: 800 }}>Qué vas a escuchar</div>
        {[
          { v: '«cero coma setenta y ocho»', d: 'después de cada repetición' },
          { v: '«cortá la serie»', d: 'una sola vez, cuando cruzás el objetivo' },
        ].map((l) => (
          <div
            key={l.v}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 3,
              padding: '11px 13px',
              borderRadius: radio.fila,
              background: 'rgba(255,255,255,0.6)',
              border: `1px solid ${color.vidrioBorde}`,
            }}
          >
            <div style={{ fontSize: 14.5, fontWeight: 700 }}>{l.v}</div>
            <div style={{ fontSize: texto.minima, fontWeight: 600, color: color.textoSuave }}>
              {l.d}
            </div>
          </div>
        ))}
      </Tarjeta>

      <GrupoAjustes>
        <FilaAjuste titulo="Decir la velocidad" derecha={<Interruptor encendido />} />
        <FilaAjuste titulo="Avisar el corte" derecha={<Interruptor encendido />} />
        <FilaAjuste titulo="Contar las repeticiones" derecha={<Interruptor />} ultima />
      </GrupoAjustes>

      <Tarjeta padding="13px 16px" gap={0} estilo={{ borderRadius: radio.cardChica }}>
        <div
          style={{
            fontSize: texto.minima,
            fontWeight: 600,
            color: color.textoSuave,
            lineHeight: 1.45,
            textWrap: 'pretty',
          }}
        >
          Usa la voz del teléfono: no descarga nada ni consume datos. Los
          auriculares Bluetooth y el sensor comparten la misma radio — si el
          audio se entrecorta, apagá la voz.
        </div>
      </Tarjeta>
    </Pantalla>
  );
}

// PLAN. Honesta sobre lo que hoy es una decisión y no un hecho: el precio del
// aparato es un objetivo, y la app no cobra por lo que ya medís.
export function Plan() {
  return (
    <Pantalla gap={12}>
      <BarraTitulo titulo="Plan" />

      <Tarjeta alta padding="20px 18px 18px" gap={14}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <div style={{ fontSize: texto.etiqueta, fontWeight: 700, color: color.textoSuave }}>
              Tu plan
            </div>
            <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: '-0.035em' }}>
              BOOST libre
            </div>
          </div>
          <Pildora tenue>Activo</Pildora>
        </div>
        <div
          style={{
            fontSize: texto.chico,
            fontWeight: 600,
            color: color.textoMedio,
            lineHeight: 1.45,
            textWrap: 'pretty',
          }}
        >
          Medir, ver la velocidad en vivo, el historial y el perfil
          carga-velocidad no se cobran. El sensor se compra una vez.
        </div>
      </Tarjeta>

      <Tarjeta padding="14px 16px" gap={2}>
        <div style={{ fontSize: texto.chico, fontWeight: 800, paddingBottom: 6 }}>
          Incluido
        </div>
        {[
          'Velocidad de cada repetición, en vivo',
          'Aviso de corte por pérdida o por velocidad',
          'Historial completo y exportación a CSV',
          'Perfil carga-velocidad con 1RM estimado',
          'Voz en los auriculares',
        ].map((t) => (
          <div
            key={t}
            style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 2px' }}
          >
            <IconoTilde tam={17} />
            <span style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.3 }}>{t}</span>
          </div>
        ))}
      </Tarjeta>

      <Tarjeta padding="14px 16px" gap={8} estilo={{ borderRadius: radio.cardChica }}>
        <div style={{ fontSize: texto.chico, fontWeight: 800 }}>El sensor</div>
        <div
          style={{
            fontSize: texto.minima,
            fontWeight: 600,
            color: color.textoSuave,
            lineHeight: 1.45,
            textWrap: 'pretty',
          }}
        >
          El precio objetivo es de menos de US$ 70, una sola vez. Todavía no está
          a la venta.
        </div>
      </Tarjeta>

      <div style={{ position: 'relative', marginTop: 'auto', flex: 'none' }}>
        <Boton>Avisarme cuando salga</Boton>
      </div>
    </Pantalla>
  );
}

// AYUDA Y LEGAL. Último nivel. Lista simple, sin adornos.
export function Ayuda() {
  return (
    <Pantalla gap={12}>
      <BarraTitulo titulo="Ayuda" />

      <GrupoAjustes titulo="Si algo no anda">
        <FilaAjuste
          icono={<IconoBarra tam={17} />}
          titulo="El conteo no coincide"
          detalle="Cómo ajustar los umbrales en el gimnasio"
        />
        <FilaAjuste
          icono={<IconoBluetooth tam={17} c="#2A2926" />}
          titulo="No conecta el sensor"
          detalle="Las tres causas más comunes"
        />
        <FilaAjuste
          icono={<IconoRayo tam={17} />}
          titulo="La batería dura poco"
          detalle="Qué la gasta y qué no"
          ultima
        />
      </GrupoAjustes>

      <GrupoAjustes titulo="Entender los números">
        <FilaAjuste titulo="Qué es la velocidad de la barra" />
        <FilaAjuste titulo="Por qué cortar por pérdida de velocidad" />
        <FilaAjuste titulo="Cuánto vale un 1RM estimado" ultima />
      </GrupoAjustes>

      <GrupoAjustes titulo="Legal">
        <FilaAjuste icono={<IconoEscudo tam={17} />} titulo="Privacidad" />
        <FilaAjuste icono={<IconoAyuda tam={17} />} titulo="Términos de uso" />
        <FilaAjuste
          icono={<IconoSalir tam={17} />}
          titulo="Cerrar sesión"
          derecha={<span />}
          ultima
        />
      </GrupoAjustes>

      <div
        style={{
          position: 'relative',
          fontSize: 10,
          fontWeight: 600,
          color: color.textoSuave,
          textAlign: 'center',
          marginTop: 'auto',
          flex: 'none',
        }}
      >
        BOOST 1.0 · Montevideo
      </div>
    </Pantalla>
  );
}
