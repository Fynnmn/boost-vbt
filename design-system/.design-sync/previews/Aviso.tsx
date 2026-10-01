import { Aviso, IconoAviso } from 'boost-design-system';

export function Corte() {
  return (
    <Aviso
      titulo="Cortá la serie"
      detalle="La velocidad ya está por debajo de tu objetivo de corte."
    />
  );
}

export function Neutro() {
  return (
    <Aviso
      titulo="Seguí"
      detalle="Te quedan 2 reps antes de llegar al objetivo."
      tono="neutro"
    />
  );
}

export function ConIcono() {
  return (
    <Aviso
      titulo="Cortá antes"
      detalle="Las dos últimas reps quedaron debajo de tu objetivo de corte de 0,50 m/s."
      icono={<IconoAviso />}
    />
  );
}
