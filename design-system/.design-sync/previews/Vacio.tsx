import { Vacio, Boton, IconoCalendario } from 'boost-design-system';

export function SinSesiones() {
  return (
    <Vacio
      icono={<IconoCalendario tam={32} c="#8A877F" />}
      titulo="Todavía no hay sesiones"
      detalle="Cuando termines tu primera serie con el sensor, va a aparecer acá con la velocidad de cada repetición."
      accion={<div style={{ width: '100%', marginTop: 8 }}><Boton coral>Comenzar sesión</Boton></div>}
    />
  );
}
