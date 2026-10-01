import { Metrica, IconoCaida, IconoObjetivo } from 'boost-design-system';

export function Alerta() {
  return (
    <Metrica
      etiqueta="Caída de velocidad"
      valor="−32%"
      pie="vs. primera rep"
      icono={<IconoCaida />}
      tono="alerta"
    />
  );
}

export function Neutra() {
  return (
    <Metrica etiqueta="Objetivo de corte" valor="0,50" unidad="m/s" icono={<IconoObjetivo />} />
  );
}
