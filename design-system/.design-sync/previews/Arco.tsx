import { Arco } from 'boost-design-system';

export function Calibrando() {
  return <Arco progreso={0.62} valor="62%" etiqueta="listo" />;
}

export function Completo() {
  return <Arco progreso={1} valor="Listo" etiqueta="calibrado" tam={150} />;
}
