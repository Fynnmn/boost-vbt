// ─── PAGOS (RevenueCat + StoreKit) ────────────────────────────────────
// Con RC.enabled = false todo es simulado (sirve para probar en TestFlight).
// Antes de App Store: completá apiKey, entitlements y packages, y poné enabled = true.
import { Purchases } from '@revenuecat/purchases-capacitor';
import { isNative, wait } from './core.js';

export const RC = {
  enabled: false,
  apiKey: 'appl_REEMPLAZAR',
  entitlements: { pro: 'pro', elite: 'elite' },
  // Identificadores de paquete en tu Offering "default" de RevenueCat
  packages: {
    'pro:mensual': 'pro_monthly', 'pro:anual': 'pro_annual',
    'elite:mensual': 'elite_monthly', 'elite:anual': 'elite_annual'
  }
};

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre'];
const fecha = iso => { const d = new Date(iso); return d.getDate() + ' de ' + MESES[d.getMonth()] + ' de ' + d.getFullYear(); };

// Resultado común: { active, plan: 'pro'|'elite', renews: '1 de octubre de 2027', account }
function toStatus(info) {
  const a = (info && info.entitlements && info.entitlements.active) || {};
  const e = a[RC.entitlements.elite] || a[RC.entitlements.pro];
  return {
    active: !!e,
    plan: a[RC.entitlements.elite] ? 'elite' : 'pro',
    renews: e && e.expirationDate ? fecha(e.expirationDate) : null,
    account: null // Apple no expone el Apple ID; ver docs/INTEGRACION.md
  };
}

let configured = false;
export const payments = {
  // true en el iPhone: el cobro SIEMPRE lo hace Apple (no se muestra la hoja de pago del prototipo).
  isNative: () => isNative(),

  async configure(appUserID) {
    if (!isNative() || !RC.enabled) return;
    if (!configured) { await Purchases.configure({ apiKey: RC.apiKey, appUserID: appUserID || undefined }); configured = true; }
    else if (appUserID) await Purchases.logIn({ appUserID });
  },

  // Al cerrar sesión: RevenueCat vuelve a un usuario anónimo, así la
  // suscripción del anterior no queda pegada al próximo que entre.
  async logOut() {
    if (!isNative() || !RC.enabled || !configured) return;
    await Purchases.logOut().catch(() => {});
  },

  async status() {
    if (!RC.enabled || !configured) return null;
    const { customerInfo } = await Purchases.getCustomerInfo();
    return toStatus(customerInfo);
  },

  async purchase(plan, billing) {
    if (!RC.enabled) { await wait(1200); return { active: true, plan }; }
    const offerings = await Purchases.getOfferings();
    const id = RC.packages[plan + ':' + billing];
    const pkg = offerings.current && offerings.current.availablePackages.find(p => p.identifier === id);
    if (!pkg) throw new Error('Paquete no encontrado: ' + id);
    try {
      const { customerInfo } = await Purchases.purchasePackage({ aPackage: pkg });
      return toStatus(customerInfo);
    } catch (e) {
      if (e && (e.userCancelled || e.code === '1')) return null; // canceló
      throw e;
    }
  },

  async restore() {
    if (!RC.enabled) { await wait(1400); return { active: true, plan: 'pro', renews: '1 de octubre de 2027', account: 'm••••@icloud.com' }; }
    const { customerInfo } = await Purchases.restorePurchases();
    return toStatus(customerInfo);
  }
};
