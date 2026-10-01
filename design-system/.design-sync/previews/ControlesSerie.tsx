import {
  ControlesSerie,
  BotonDisco,
  IconoDetener,
  IconoPausa,
  IconoReiniciar,
} from 'boost-design-system';

export function Default() {
  return (
    <ControlesSerie
      izquierda={<BotonDisco icono={<IconoDetener />} etiqueta="Finalizar" />}
      centro={<BotonDisco icono={<IconoPausa />} etiqueta="Pausa" principal />}
      derecha={<BotonDisco icono={<IconoReiniciar />} etiqueta="Reiniciar serie" />}
    />
  );
}
