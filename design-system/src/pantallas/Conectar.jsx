import React from 'react';
import { imagenSensor as IMAGEN_SENSOR, imagenSensorEnBarra as IMAGEN_BARRA } from '../tokens/imagenes.js';
import { color, texto } from '../tokens/tokens.js';
import { Pantalla, Tarjeta, Encabezado, Disco } from '../components/Superficies.jsx';
import { Boton, Fila } from '../components/Controles.jsx';
import { IconoMas3, IconoBluetooth } from '../components/Iconos.jsx';

// CONECTAR. Primera pantalla de la app. El dispositivo ocupa el lugar del dato
// porque acá lo que hay que entender es físico: dónde va el sensor. El texto no
// promete que no hay configuración — el sensor sí se calibra y sí hay que
// apretar "Comenzar serie" después.
export function Conectar({
  sensor = 'BOOST 3F2A',
  bateria = 87,
  imagenSensor = IMAGEN_SENSOR,
  buscando = true,
}) {
  return (
    <Pantalla>
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

      <Tarjeta alta padding="26px 22px 24px" gap={6} estilo={{ alignItems: 'center' }}>
        <div
          style={{
            position: 'relative',
            width: 240,
            height: 190,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              position: 'absolute',
              width: 190,
              height: 190,
              borderRadius: '50%',
              border: '1px solid rgba(238,69,38,0.18)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              width: 250,
              height: 250,
              borderRadius: '50%',
              border: '1px solid rgba(238,69,38,0.09)',
            }}
          />
          <img
            src={imagenSensor}
            alt=""
            style={{
              width: 210,
              height: 'auto',
              display: 'block',
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
            lineHeight: 1.1,
            marginTop: 8,
            textAlign: 'center',
          }}
        >
          Conectá tu sensor
        </div>
        <div
          style={{
            fontSize: texto.cuerpo,
            fontWeight: 600,
            color: color.textoSuave,
            textAlign: 'center',
            lineHeight: 1.35,
            textWrap: 'pretty',
            maxWidth: 280,
          }}
        >
          Pegalo al eje de la barra y encendelo. La app lo encuentra sola.
        </div>
      </Tarjeta>

      <Tarjeta padding="14px 16px" gap={10} estilo={{ borderRadius: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: texto.chico, fontWeight: 800 }}>Cerca de vos</div>
          {buscando ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: texto.minima,
                fontWeight: 600,
                color: color.textoSuave,
              }}
            >
              <span
                style={{ width: 7, height: 7, borderRadius: '50%', background: color.coral }}
              />
              Buscando
            </div>
          ) : null}
        </div>
        <Fila
          activa
          icono={<IconoBluetooth />}
          titulo={sensor}
          detalle={`Batería ${bateria}% · Señal fuerte`}
        />
      </Tarjeta>

      <div
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 14,
          marginTop: 'auto',
          flex: 'none',
        }}
      >
        <Boton coral>Conectar</Boton>
        <div style={{ fontSize: texto.chico, fontWeight: 600, color: color.textoSuave }}>
          Probar con el sensor simulado
        </div>
      </div>
    </Pantalla>
  );
}
