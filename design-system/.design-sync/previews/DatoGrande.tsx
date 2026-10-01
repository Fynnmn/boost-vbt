import { DatoGrande } from 'boost-design-system';

export function Normal() {
  return <DatoGrande valor="0,71" />;
}

export function Alerta() {
  return <DatoGrande valor="0,42" alerta />;
}

export function SinUnidad() {
  return <DatoGrande valor="−32%" unidad={null} tam={56} alerta />;
}
