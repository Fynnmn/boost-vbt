import { Pasos } from 'boost-design-system';

export function Primero() {
  return <Pasos actual={1} total={3} />;
}

export function Ultimo() {
  return <Pasos actual={3} total={3} />;
}
