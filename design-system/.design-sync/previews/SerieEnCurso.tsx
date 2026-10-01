import { SerieEnCurso } from 'boost-design-system';

export function Default() {
  return <SerieEnCurso />;
}

export function CercaDelCorte() {
  return <SerieEnCurso velocidades={[0.78, 0.71, 0.62, 0.55, 0.52]} />;
}
