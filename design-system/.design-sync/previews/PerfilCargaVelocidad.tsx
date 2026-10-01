import { PerfilCargaVelocidad } from 'boost-design-system';

export function Default() {
  return <PerfilCargaVelocidad />;
}

export function PocosPuntos() {
  return <PerfilCargaVelocidad puntos={[{ carga: 80, v: 0.7 }, { carga: 90, v: 0.58 }, { carga: 100, v: 0.47 }]} />;
}
