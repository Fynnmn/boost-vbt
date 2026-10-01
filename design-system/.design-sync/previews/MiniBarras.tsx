import { MiniBarras } from 'boost-design-system';

export function Sostenida() {
  return <MiniBarras velocidades={[0.85, 0.82, 0.78, 0.74, 0.71, 0.68]} />;
}

export function Cayendo() {
  return <MiniBarras velocidades={[0.78, 0.71, 0.62, 0.55, 0.48, 0.42]} alto={40} />;
}
