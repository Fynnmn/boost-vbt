import { Capacitor, registerPlugin } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';

export const isNative = () => Capacitor.isNativePlatform();
export const VeloNative = registerPlugin('VeloNative'); // ios-native/App/VeloNativePlugin.swift
export const wait = ms => new Promise(r => setTimeout(r, ms));

export function initShell() {
  if (!isNative()) return;
  const root = document.documentElement;
  root.classList.add('velo-native');
  // En la app nativa no hay zoom con pellizco (como cualquier app de iOS; el Zoom de
  // accesibilidad del sistema sigue andando). En la web sí se puede hacer zoom.
  const vp = document.querySelector('meta[name="viewport"]');
  if (vp && !/user-scalable/.test(vp.content)) vp.content += ', maximum-scale=1, user-scalable=no';
  const fit = () => {
    const s = window.innerWidth / 390;
    root.style.setProperty('--velo-s', String(s));
    root.style.setProperty('--velo-h', window.innerHeight / s + 'px');
  };
  fit();
  window.addEventListener('resize', fit);
}

// Pantallas con fondo oscuro → texto claro en la barra de estado real.
const DARK = new Set(['nova']);
export const native = {
  onScreen(screen) {
    if (!isNative()) return;
    StatusBar.setStyle({ style: DARK.has(screen) ? Style.Dark : Style.Light }).catch(() => {});
  }
};
