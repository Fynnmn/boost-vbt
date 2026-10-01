import { Pantalla, Tarjeta, Encabezado } from 'boost-design-system';

export function Basica() {
  return (
    <Pantalla>
      <Encabezado />
      <Tarjeta>Contenido de la pantalla</Tarjeta>
    </Pantalla>
  );
}

export function EspaciadoAjustado() {
  return (
    <Pantalla gap={8} abajo={18}>
      <Tarjeta>Gap chico, como en la serie en vivo</Tarjeta>
    </Pantalla>
  );
}
