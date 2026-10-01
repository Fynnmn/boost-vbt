import { BarraTitulo, Pasos } from 'boost-design-system';

export function Volver() {
  return <div style={{ width: 358 }}><BarraTitulo titulo="Objetivo de corte" /></div>;
}

export function ConPasos() {
  return <div style={{ width: 358 }}><BarraTitulo titulo="Buscar sensor" derecha={<Pasos actual={1} total={3} />} /></div>;
}

export function Cerrar() {
  return <div style={{ width: 358 }}><BarraTitulo titulo="Sesión terminada" cerrar /></div>;
}
