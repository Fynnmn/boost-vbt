// Vibración sutil al pasar por cada valor (peso, altura, edad, objetivos). Solo iPhone.
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { isNative } from './core.js';

export const haptics = {
  tick() { if (isNative()) Haptics.selectionChanged().catch(() => {}); },
  tap() { if (isNative()) Haptics.impact({ style: ImpactStyle.Light }).catch(() => {}); }
};
