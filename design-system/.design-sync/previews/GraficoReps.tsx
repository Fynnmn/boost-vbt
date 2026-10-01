import { GraficoReps } from 'boost-design-system';

export function Default() {
  return <GraficoReps velocidades={[0.78, 0.71, 0.62, 0.55, 0.48, 0.42]} objetivo={0.5} />;
}

export function SinValores() {
  return (
    <GraficoReps
      velocidades={[0.78, 0.71, 0.62, 0.55, 0.48, 0.42]}
      objetivo={0.5}
      alto={70}
      conValores={false}
    />
  );
}
