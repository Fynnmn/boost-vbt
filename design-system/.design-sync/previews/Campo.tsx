import { Campo, IconoCorreo, IconoCandado } from 'boost-design-system';

export function Vacio() {
  return <Campo etiqueta="Correo" marcador="tu@correo.com" icono={<IconoCorreo />} />;
}

export function ConValor() {
  return <Campo etiqueta="Correo" valor="maximo@ejemplo.com" icono={<IconoCorreo />} />;
}

export function EnFoco() {
  return <Campo etiqueta="Contraseña" valor="12345678" tipo="clave" foco icono={<IconoCandado />} />;
}
