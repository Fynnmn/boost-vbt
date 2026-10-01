import { Disco, IconoBarras, IconoMas3 } from 'boost-design-system';

export function Chico() {
  return (
    <Disco tam={44}>
      <IconoBarras />
    </Disco>
  );
}

export function Grande() {
  return (
    <Disco tam={64} fondo="rgba(238,69,38,0.10)">
      <IconoMas3 />
    </Disco>
  );
}
