import { Fila, IconoBluetooth } from 'boost-design-system';

export function Activa() {
  return (
    <Fila activa icono={<IconoBluetooth />} titulo="BOOST 3F2A" detalle="Batería 87% · Señal fuerte" />
  );
}

export function Inactiva() {
  return <Fila titulo="Press de banca" detalle="4 series · 100 kg" />;
}
