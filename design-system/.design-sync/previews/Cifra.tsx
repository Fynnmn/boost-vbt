import { Cifra } from 'boost-design-system';

export function Normal() {
  return <Cifra etiqueta="Serie" valor={3} sufijo="/ 4" />;
}

export function Grande() {
  return <Cifra etiqueta="Mejor rep" valor="0,78" sufijo="m/s" tam={44} />;
}
