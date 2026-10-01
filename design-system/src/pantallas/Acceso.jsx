import React from 'react';
import { imagenSensor as IMAGEN_SENSOR, imagenSensorEnBarra as IMAGEN_BARRA } from '../tokens/imagenes.js';
import { color, texto, radio } from '../tokens/tokens.js';
import { Pantalla, Tarjeta, Encabezado, Disco, BarraTitulo } from '../components/Superficies.jsx';
import { Boton, Fila } from '../components/Controles.jsx';
import { Campo } from '../components/Formularios.jsx';
import {
  IconoCorreo,
  IconoCandado,
  IconoUsuario,
  IconoBarras,
  IconoObjetivo,
  IconoRayo,
  IconoEscudo,
  IconoSinSenal,
} from '../components/Iconos.jsx';

// BIENVENIDA. Primera pantalla al abrir la app sin cuenta. No promete
// prestaciones medidas — el aparato no existe hasta que llegue y se pruebe — así
// que la promesa es sobre la decisión, no sobre la precisión.
export function Bienvenida({ imagenSensor = IMAGEN_SENSOR }) {
  return (
    <Pantalla gap={14}>
      <div
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 4,
          marginTop: 18,
          flex: 'none',
        }}
      >
        <div style={{ fontSize: 40, fontWeight: 900, letterSpacing: '-0.05em', lineHeight: 1 }}>
          BOOST<span style={{ color: color.coralLogo }}>.</span>
        </div>
        <div style={{ fontSize: texto.chico, fontWeight: 700, color: color.textoSuave }}>
          Entrenamiento por velocidad
        </div>
      </div>

      <div
        style={{
          position: 'relative',
          display: 'flex',
          justifyContent: 'center',
          padding: '6px 0 2px',
          flex: 'none',
        }}
      >
        <img
          src={imagenSensor}
          alt=""
          style={{
            width: 250,
            height: 'auto',
            filter: 'drop-shadow(0 24px 28px rgba(7,7,7,0.30))',
          }}
        />
      </div>

      <div
        style={{
          position: 'relative',
          fontSize: 30,
          fontWeight: 900,
          letterSpacing: '-0.035em',
          lineHeight: 1.1,
          textAlign: 'center',
          textWrap: 'balance',
          padding: '0 10px',
          flex: 'none',
        }}
      >
        Dejá de estimar<br />cuándo cortar
      </div>
      <div
        style={{
          position: 'relative',
          fontSize: texto.cuerpo,
          fontWeight: 600,
          color: color.textoSuave,
          textAlign: 'center',
          lineHeight: 1.4,
          textWrap: 'pretty',
          padding: '0 24px',
          flex: 'none',
        }}
      >
        El sensor mide la velocidad de cada repetición y te dice cuándo la serie
        dejó de sumar.
      </div>

      <Tarjeta padding="6px 16px" gap={0} estilo={{ marginTop: 'auto' }}>
        {[
          { t: 'La velocidad de cada repetición', i: <IconoBarras tam={18} c="#2A2926" trazo={2.4} /> },
          { t: 'Te avisa cuándo cortar la serie', i: <IconoObjetivo tam={18} /> },
          { t: 'Sin suscripción para medir', i: <IconoRayo tam={18} /> },
        ].map((f, i, arr) => (
          <div
            key={f.t}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '12px 2px',
              borderBottom: i === arr.length - 1 ? 'none' : `1px solid ${color.linea}`,
            }}
          >
            <Disco tam={32} fondo="rgba(7,7,7,0.05)" sombraPropia="none">
              {f.i}
            </Disco>
            <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.01em' }}>{f.t}</span>
          </div>
        ))}
      </Tarjeta>

      <div
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          flex: 'none',
        }}
      >
        <Boton coral>Crear cuenta</Boton>
        <Boton>Ya tengo cuenta</Boton>
      </div>
    </Pantalla>
  );
}

// CREAR CUENTA. Tres campos y nada más. Todo lo que se pueda preguntar después
// —peso, ejercicios, objetivos— se pregunta después: acá el que abrió la app
// quiere levantar, no completar un formulario.
export function CrearCuenta() {
  return (
    <Pantalla gap={16}>
      <BarraTitulo titulo="Crear cuenta" />

      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Campo etiqueta="Nombre" valor="Máximo" icono={<IconoUsuario tam={20} c="#8A877F" />} />
        <Campo
          etiqueta="Correo"
          valor="maximo@ejemplo.com"
          icono={<IconoCorreo />}
        />
        <Campo
          etiqueta="Contraseña"
          valor="12345678"
          tipo="clave"
          foco
          icono={<IconoCandado />}
        />
      </div>

      <div
        style={{
          position: 'relative',
          fontSize: texto.minima,
          fontWeight: 600,
          color: color.textoSuave,
          lineHeight: 1.45,
          textWrap: 'pretty',
          padding: '0 6px',
          flex: 'none',
        }}
      >
        Al crear la cuenta aceptás los términos y la política de privacidad.
        Tus series se guardan en tu cuenta para armar el perfil carga-velocidad.
      </div>

      <div
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          marginTop: 'auto',
          flex: 'none',
        }}
      >
        <Boton coral>Crear cuenta</Boton>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '2px 0',
          }}
        >
          <div style={{ flex: 1, borderTop: `1px solid ${color.linea}` }} />
          <span style={{ fontSize: texto.minima, fontWeight: 700, color: color.textoSuave }}>
            o
          </span>
          <div style={{ flex: 1, borderTop: `1px solid ${color.linea}` }} />
        </div>
        <Boton>Continuar con Apple</Boton>
      </div>
    </Pantalla>
  );
}

// INICIAR SESIÓN.
export function IniciarSesion() {
  return (
    <Pantalla gap={16}>
      <BarraTitulo titulo="Iniciar sesión" />

      <div
        style={{
          position: 'relative',
          fontSize: 26,
          fontWeight: 900,
          letterSpacing: '-0.035em',
          lineHeight: 1.1,
          padding: '6px 4px 0',
          flex: 'none',
        }}
      >
        Bienvenido de vuelta
      </div>

      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Campo etiqueta="Correo" valor="maximo@ejemplo.com" icono={<IconoCorreo />} />
        <Campo
          etiqueta="Contraseña"
          valor="12345678"
          tipo="clave"
          foco
          icono={<IconoCandado />}
        />
      </div>

      <div
        style={{
          position: 'relative',
          fontSize: texto.chico,
          fontWeight: 700,
          color: color.coral,
          paddingLeft: 4,
          flex: 'none',
        }}
      >
        Olvidé mi contraseña
      </div>

      <div
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          marginTop: 'auto',
          flex: 'none',
        }}
      >
        <Boton coral>Entrar</Boton>
        <Boton>Continuar con Apple</Boton>
      </div>
    </Pantalla>
  );
}

// PERMISO DE BLUETOOTH. Se pide explicando para qué, antes de que salte el
// cartel del sistema: un permiso que aparece sin contexto se rechaza.
export function PermisoBluetooth({ imagenSensor = IMAGEN_SENSOR }) {
  return (
    <Pantalla gap={16}>
      <Encabezado />

      <Tarjeta alta padding="30px 24px 26px" gap={12} estilo={{ alignItems: 'center' }}>
        <Disco tam={96} fondo={color.coralTenue} sombraPropia="none">
          <IconoRayo tam={44} c={color.coral} trazo={1.8} />
        </Disco>
        <div
          style={{
            fontSize: texto.titulo,
            fontWeight: 900,
            letterSpacing: '-0.03em',
            textAlign: 'center',
            marginTop: 6,
          }}
        >
          BOOST necesita Bluetooth
        </div>
        <div
          style={{
            fontSize: texto.cuerpo,
            fontWeight: 600,
            color: color.textoSuave,
            textAlign: 'center',
            lineHeight: 1.4,
            textWrap: 'pretty',
            maxWidth: 290,
          }}
        >
          Es la única forma de hablar con el sensor de la barra. No usa tu
          ubicación ni sale a internet para medir.
        </div>
      </Tarjeta>

      <Tarjeta padding="6px 16px" gap={0}>
        {[
          {
            t: 'Lee la velocidad en vivo',
            d: 'Cada repetición llega al teléfono mientras levantás',
            i: <IconoBarras tam={18} c={color.coral} trazo={2.4} />,
            fondo: color.coralTenue,
          },
          {
            t: 'No pide tu ubicación',
            d: 'Algunas apps la piden para usar Bluetooth. Esta no.',
            i: <IconoEscudo tam={18} />,
            fondo: 'rgba(7,7,7,0.05)',
          },
          {
            t: 'Mide sin internet',
            d: 'La sesión entera funciona con el teléfono en modo avión',
            i: <IconoSinSenal tam={18} c="#2A2926" trazo={2.1} />,
            fondo: 'rgba(7,7,7,0.05)',
          },
        ].map((f, i, arr) => (
          <div
            key={f.t}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '12px 2px',
              borderBottom: i === arr.length - 1 ? 'none' : `1px solid ${color.linea}`,
            }}
          >
            <Disco tam={34} fondo={f.fondo} sombraPropia="none">
              {f.i}
            </Disco>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14.5, fontWeight: 700 }}>{f.t}</div>
              <div style={{ fontSize: texto.minima, fontWeight: 600, color: color.textoSuave }}>
                {f.d}
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
        <Boton coral>Permitir Bluetooth</Boton>
        <div
          style={{
            fontSize: texto.chico,
            fontWeight: 600,
            color: color.textoSuave,
            textAlign: 'center',
          }}
        >
          Probar con el sensor simulado
        </div>
      </div>
    </Pantalla>
  );
}
