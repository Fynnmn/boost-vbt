import { CabeceraEjercicio, Pildora } from 'boost-design-system';

export function Default() {
  return (
    <CabeceraEjercicio
      nombre="Press de banca"
      detalle="Sesión en vivo"
      derecha={<Pildora viva>En vivo</Pildora>}
    />
  );
}

export function SinDetalle() {
  return (
    <CabeceraEjercicio
      nombre="Serie terminada"
      detalle="Press de banca · Serie 3 de 4 · 100 kg"
    />
  );
}
