import { Encabezado, PildoraVidrio, IconoReloj } from 'boost-design-system';

export function Simple() {
  return <Encabezado />;
}

export function ConAccion() {
  return (
    <Encabezado
      derecha={
        <PildoraVidrio>
          <IconoReloj />
          Descanso 1:32
        </PildoraVidrio>
      }
    />
  );
}
