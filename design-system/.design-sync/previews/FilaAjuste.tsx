import { FilaAjuste, Interruptor, IconoOnda, IconoObjetivo } from 'boost-design-system';

export function ConFlecha() {
  return <FilaAjuste icono={<IconoObjetivo tam={17} />} titulo="Objetivo de corte" detalle="20 % de pérdida" ultima />;
}

export function ConInterruptor() {
  return <FilaAjuste icono={<IconoOnda tam={17} />} titulo="Voz en los auriculares" derecha={<Interruptor encendido />} ultima />;
}
