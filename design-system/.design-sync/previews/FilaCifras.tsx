import { FilaCifras } from 'boost-design-system';

export function Default() {
  return (
    <FilaCifras
      items={[
        { etiqueta: 'Serie', valor: 3, sufijo: '/ 4' },
        { etiqueta: 'Rep', valor: 6, sufijo: '/ 8' },
        { etiqueta: 'Carga', valor: 100, sufijo: 'kg' },
      ]}
    />
  );
}
