import React from 'react';
import { createRoot } from 'react-dom/client';
import * as P from './index.js';

// Galeria de revision: todas las pantallas de la app, agrupadas por el momento
// en que aparecen. Es la vista de trabajo, no se publica.
const GRUPOS = [
  {
    titulo: 'Entrar',
    pantallas: [
      ['Bienvenida', P.Bienvenida],
      ['Crear cuenta', P.CrearCuenta],
      ['Iniciar sesion', P.IniciarSesion],
      ['Permiso Bluetooth', P.PermisoBluetooth],
    ],
  },
  {
    titulo: 'Poner el sensor',
    pantallas: [
      ['Buscando', P.BuscandoSensor],
      ['No encontrado', P.SensorNoEncontrado],
      ['Conectar', P.Conectar],
      ['Colocacion', P.Colocacion],
      ['Calibrando', P.Calibrando],
    ],
  },
  {
    titulo: 'Antes de levantar',
    pantallas: [
      ['Inicio', P.Inicio],
      ['Elegir ejercicio', P.ElegirEjercicio],
      ['Armar serie', P.ArmarSerie],
      ['Objetivo de corte', P.ObjetivoCorte],
    ],
  },
  {
    titulo: 'La serie',
    pantallas: [
      ['Esperando', P.SerieEsperando],
      ['En curso', P.SerieEnCurso],
      ['Corta la serie', P.EnVivo],
      ['En pausa', P.SeriePausada],
      ['Descanso', P.Descanso],
    ],
  },
  {
    titulo: 'Resultados',
    pantallas: [
      ['Resumen de serie', P.Resumen],
      ['Resumen de sesion', P.ResumenSesion],
      ['Historial', P.Historial],
      ['Detalle de sesion', P.DetalleSesion],
      ['Perfil carga-velocidad', P.PerfilVelocidad],
      ['Historial vacio', P.HistorialVacio],
    ],
  },
  {
    titulo: 'Cuenta y ajustes',
    pantallas: [
      ['Cuenta', P.Cuenta],
      ['Umbrales del sensor', P.AjustesSensor],
      ['Voz', P.Voz],
      ['Plan', P.Plan],
      ['Ayuda', P.Ayuda],
    ],
  },
  {
    titulo: 'Cuando algo falla',
    pantallas: [['Sensor desconectado', P.SensorDesconectado]],
  },
];

function Galeria() {
  return (
    <div style={{ padding: '40px 40px 80px', display: 'flex', flexDirection: 'column', gap: 54 }}>
      <div style={{ color: '#F2EFE9', fontSize: 30, fontWeight: 900, letterSpacing: '-0.03em' }}>
        BOOST — todas las pantallas
      </div>
      {GRUPOS.map((g) => (
        <div key={g.titulo} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div
            style={{
              color: '#8A877F',
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            {g.titulo}
          </div>
          <div style={{ display: 'flex', gap: 34, flexWrap: 'wrap' }}>
            {g.pantallas.map(([nombre, Comp]) => (
              <div
                key={nombre}
                style={{ display: 'flex', flexDirection: 'column', gap: 9, alignItems: 'center' }}
              >
                <div style={{ color: '#ACA9A2', fontSize: 12, fontWeight: 700 }}>{nombre}</div>
                <Comp />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

createRoot(document.getElementById('root')).render(<Galeria />);
