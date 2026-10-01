import { GrupoAjustes, FilaAjuste, Interruptor, IconoOnda, IconoCampana, IconoObjetivo } from 'boost-design-system';

export function Entrenamiento() {
  return (
    <GrupoAjustes titulo="Entrenamiento">
      <FilaAjuste icono={<IconoObjetivo tam={17} />} titulo="Objetivo de corte" detalle="20 % de pérdida" />
      <FilaAjuste icono={<IconoOnda tam={17} />} titulo="Voz en los auriculares" derecha={<Interruptor encendido />} />
      <FilaAjuste icono={<IconoCampana tam={17} />} titulo="Avisar al terminar el descanso" derecha={<Interruptor />} ultima />
    </GrupoAjustes>
  );
}
