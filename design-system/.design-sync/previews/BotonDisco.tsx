import { BotonDisco, IconoPausa, IconoDetener } from 'boost-design-system';

export function Secundario() {
  return <BotonDisco icono={<IconoDetener />} etiqueta="Finalizar" />;
}

export function Principal() {
  return <BotonDisco icono={<IconoPausa />} etiqueta="Pausa" principal />;
}
