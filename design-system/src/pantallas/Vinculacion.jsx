import React from 'react';
import { imagenSensor as IMAGEN_SENSOR, imagenSensorEnBarra as IMAGEN_BARRA } from '../tokens/imagenes.js';
import { color, texto, radio } from '../tokens/tokens.js';
import { Pantalla, Tarjeta, Encabezado, Disco, BarraTitulo, Pasos } from '../components/Superficies.jsx';
import { Boton, Fila } from '../components/Controles.jsx';
import { Arco, Bateria } from '../components/Graficos.jsx';
import { Vacio, Simulado } from '../components/Formularios.jsx';
import {
  IconoBluetooth,
  IconoSinSenal,
  IconoAyuda,
  IconoTilde,
  IconoBarra,
} from '../components/Iconos.jsx';

// BUSCANDO SENSOR. El estado de espera dice qué está pasando y qué hacer
// mientras tanto, en vez de una rueda girando sin explicación.
export function BuscandoSensor({ imagenSensor = IMAGEN_SENSOR }) {
  return (
    <Pantalla gap={14}>
      <BarraTitulo titulo="Buscar sensor" derecha={<Pasos actual={1} total={3} />} />

      <Tarjeta alta padding="26px 22px 24px" gap={8} estilo={{ alignItems: 'center' }}>
        <div
          style={{
            position: 'relative',
            width: 240,
            height: 200,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {[150, 200, 250].map((d, i) => (
            <div
              key={d}
              style={{
                position: 'absolute',
                width: d,
                height: d,
                borderRadius: '50%',
                border: `1px solid rgba(238,69,38,${0.22 - i * 0.06})`,
              }}
            />
          ))}
          <img
            src={imagenSensor}
            alt=""
            style={{
              width: 190,
              height: 'auto',
              position: 'relative',
              filter: 'drop-shadow(0 18px 22px rgba(7,7,7,0.28))',
            }}
          />
        </div>
        <div
          style={{
            fontSize: texto.titulo,
            fontWeight: 900,
            letterSpacing: '-0.03em',
            marginTop: 6,
          }}
        >
          Buscando tu sensor
        </div>
        <div
          style={{
            fontSize: texto.cuerpo,
            fontWeight: 600,
            color: color.textoSuave,
            textAlign: 'center',
            lineHeight: 1.4,
            textWrap: 'pretty',
            maxWidth: 280,
          }}
        >
          Apretá el botón del sensor una vez. La luz tiene que quedar
          parpadeando en naranja.
        </div>
      </Tarjeta>

      <Tarjeta padding="14px 16px" gap={10} estilo={{ borderRadius: radio.cardChica }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            fontSize: texto.chico,
            fontWeight: 800,
          }}
        >
          <span
            style={{ width: 7, height: 7, borderRadius: '50%', background: color.coral }}
          />
          Escaneando…
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 13,
                height: 68,
                padding: '0 14px',
                borderRadius: radio.fila,
                background: 'rgba(255,255,255,0.45)',
                border: `1px solid ${color.vidrioBorde}`,
                opacity: 1 - i * 0.3,
                boxSizing: 'border-box',
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  background: 'rgba(7,7,7,0.06)',
                  flex: 'none',
                }}
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7, flex: 1 }}>
                <div
                  style={{ width: '58%', height: 11, borderRadius: 5, background: 'rgba(7,7,7,0.09)' }}
                />
                <div
                  style={{ width: '38%', height: 9, borderRadius: 5, background: 'rgba(7,7,7,0.06)' }}
                />
              </div>
            </div>
          ))}
        </div>
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
        <div
          style={{
            fontSize: texto.minima,
            fontWeight: 600,
            color: color.textoSuave,
            textAlign: 'center',
            lineHeight: 1.4,
          }}
        >
          Suele tardar menos de diez segundos.
        </div>
        <Boton>No aparece</Boton>
      </div>
    </Pantalla>
  );
}

// SENSOR NO ENCONTRADO. El error nombra las tres causas reales en orden de
// probabilidad, en vez de decir "algo salió mal".
export function SensorNoEncontrado() {
  return (
    <Pantalla gap={14}>
      <BarraTitulo titulo="No lo encontramos" />

      <Vacio
        icono={<IconoSinSenal tam={34} />}
        titulo="No apareció ningún sensor"
        detalle="Estuvimos 30 segundos buscando y no hubo respuesta."
      />

      <Tarjeta padding="6px 16px" gap={0}>
        {[
          {
            n: '1',
            t: 'Encendelo',
            d: 'Un toque al botón. La luz naranja tiene que parpadear.',
          },
          {
            n: '2',
            t: 'Acercá el teléfono',
            d: 'A menos de dos metros de la barra, sin la mochila en el medio.',
          },
          {
            n: '3',
            t: 'Puede estar sin batería',
            d: 'Cargalo por USB-C; con diez minutos alcanza para una sesión.',
          },
        ].map((p, i, arr) => (
          <div
            key={p.n}
            style={{
              display: 'flex',
              gap: 13,
              padding: '13px 2px',
              borderBottom: i === arr.length - 1 ? 'none' : `1px solid ${color.linea}`,
            }}
          >
            <Disco tam={28} fondo="rgba(7,7,7,0.05)" sombraPropia="none">
              <span style={{ fontSize: 13, fontWeight: 800, color: color.textoMedio }}>
                {p.n}
              </span>
            </Disco>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{p.t}</div>
              <div
                style={{
                  fontSize: texto.etiqueta,
                  fontWeight: 600,
                  color: color.textoSuave,
                  lineHeight: 1.35,
                  textWrap: 'pretty',
                }}
              >
                {p.d}
              </div>
            </div>
          </div>
        ))}
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
        <Boton coral>Buscar de nuevo</Boton>
        <Boton>Usar el sensor simulado</Boton>
      </div>
    </Pantalla>
  );
}

// COLOCACIÓN. La foto del producto real hace el trabajo: dónde va el sensor es
// una pregunta física. El texto insiste en el eje y no en la manga, porque la
// manga gira sobre sí misma y arruina la medición — es el riesgo número uno del
// proyecto.
export function Colocacion({ imagenBarra = IMAGEN_BARRA }) {
  return (
    <Pantalla gap={14}>
      <BarraTitulo titulo="Dónde va" derecha={<Pasos actual={2} total={3} />} />

      <div
        style={{
          position: 'relative',
          borderRadius: radio.cardAlta,
          overflow: 'hidden',
          border: `1px solid ${color.vidrioBordeAlto}`,
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,1), 0 18px 40px -24px rgba(7,7,7,0.32)',
          flex: 'none',
        }}
      >
        <img
          src={imagenBarra}
          alt="El sensor pegado al eje de la barra, contra la manga"
          style={{ width: '100%', height: 240, objectFit: 'cover', display: 'block' }}
        />
      </div>

      <div
        style={{
          position: 'relative',
          fontSize: texto.titulo,
          fontWeight: 900,
          letterSpacing: '-0.03em',
          lineHeight: 1.15,
          padding: '2px 4px 0',
          flex: 'none',
        }}
      >
        Pegalo al eje, contra la manga
      </div>

      <Tarjeta padding="14px 16px" gap={0}>
        {[
          { t: 'Al eje, no a la manga', d: 'La manga gira sobre sí misma y falsea la medición.', ok: true },
          { t: 'Con el logo hacia afuera', d: 'Los imanes ya lo dejan en la posición correcta.', ok: true },
          { t: 'Del lado que te queda cómodo', d: 'Izquierda o derecha da igual: se calibra solo.', ok: true },
        ].map((p, i, arr) => (
          <div
            key={p.t}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '12px 2px',
              borderBottom: i === arr.length - 1 ? 'none' : `1px solid ${color.linea}`,
            }}
          >
            <Disco tam={30} fondo="rgba(53,199,122,0.12)" sombraPropia="none">
              <IconoTilde tam={17} />
            </Disco>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1 }}>
              <div style={{ fontSize: 14.5, fontWeight: 700 }}>{p.t}</div>
              <div style={{ fontSize: texto.minima, fontWeight: 600, color: color.textoSuave }}>
                {p.d}
              </div>
            </div>
          </div>
        ))}
      </Tarjeta>

      <div style={{ position: 'relative', marginTop: 'auto', flex: 'none' }}>
        <Boton coral>Ya está puesto</Boton>
      </div>
    </Pantalla>
  );
}

// CALIBRACIÓN. Aprovecha los segundos en que la barra está apoyada; no le pide
// al usuario que espere quieto. Nunca decir "sin configuración": el sensor sí se
// calibra y sí hay que apretar "Comenzar serie" después.
export function Calibrando({ progreso = 0.62 }) {
  return (
    <Pantalla gap={16}>
      <BarraTitulo titulo="Calibrando" derecha={<Pasos actual={3} total={3} />} />

      <Tarjeta alta padding="26px 22px 22px" gap={14} estilo={{ alignItems: 'center' }}>
        <Arco progreso={progreso} valor={`${Math.round(progreso * 100)}%`} etiqueta="listo" />
        <div
          style={{
            fontSize: texto.tituloCard,
            fontWeight: 800,
            letterSpacing: '-0.02em',
            textAlign: 'center',
          }}
        >
          Dejá la barra apoyada
        </div>
        <div
          style={{
            fontSize: texto.chico,
            fontWeight: 600,
            color: color.textoSuave,
            textAlign: 'center',
            lineHeight: 1.4,
            textWrap: 'pretty',
            maxWidth: 270,
            marginTop: -6,
          }}
        >
          El sensor está midiendo la gravedad para saber de qué lado quedó
          puesto. Son unos segundos.
        </div>
      </Tarjeta>

      <Tarjeta padding="14px 16px" gap={12}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Disco tam={36} fondo={color.coralTenue} sombraPropia="none">
              <IconoBluetooth tam={18} />
            </Disco>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 14.5, fontWeight: 700 }}>BOOST 3F2A</span>
              <span style={{ fontSize: texto.minima, fontWeight: 600, color: color.textoSuave }}>
                Conectado
              </span>
            </div>
          </div>
          <Bateria nivel={87} />
        </div>
      </Tarjeta>

      <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', flex: 'none' }}>
        <Simulado />
      </div>

      <div style={{ position: 'relative', marginTop: 'auto', flex: 'none' }}>
        <Boton>Cancelar</Boton>
      </div>
    </Pantalla>
  );
}

// SENSOR DESCONECTADO. Pasa en el gimnasio: el teléfono queda lejos, o los
// auriculares Bluetooth se pelean por la radio. Lo importante es que la serie en
// curso no se pierde.
export function SensorDesconectado() {
  return (
    <Pantalla gap={14}>
      <BarraTitulo titulo="Se cortó" cerrar />

      <Vacio
        icono={<IconoSinSenal tam={34} />}
        titulo="Perdimos el sensor"
        detalle="La serie que venías haciendo quedó guardada hasta la repetición 4."
      />

      <Tarjeta padding="6px 16px" gap={0}>
        {[
          { t: 'Acercá el teléfono a la barra', d: 'A más de dos metros la señal se corta.' },
          { t: '¿Auriculares Bluetooth puestos?', d: 'Comparten la radio del teléfono con el sensor.' },
          { t: '¿Se apagó el sensor?', d: 'Se duerme solo después de diez minutos sin movimiento.' },
          { t: 'Nada se pierde', d: 'Las reps que ya midió quedan guardadas en el sensor.' },
        ].map((p, i, arr) => (
          <div
            key={p.t}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
              padding: '13px 2px',
              borderBottom: i === arr.length - 1 ? 'none' : `1px solid ${color.linea}`,
            }}
          >
            <div style={{ fontSize: 14.5, fontWeight: 700 }}>{p.t}</div>
            <div
              style={{
                fontSize: texto.minima,
                fontWeight: 600,
                color: color.textoSuave,
                lineHeight: 1.35,
                textWrap: 'pretty',
              }}
            >
              {p.d}
            </div>
          </div>
        ))}
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
        <Boton coral>Reconectar</Boton>
        <Boton>Guardar la serie y salir</Boton>
      </div>
    </Pantalla>
  );
}
