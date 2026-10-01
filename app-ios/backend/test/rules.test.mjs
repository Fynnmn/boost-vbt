// Reglas de Firestore contra el emulador. Correr con: npm test
import { readFileSync } from 'node:fs';
import { test, before, after, beforeEach } from 'node:test';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, deleteDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';

let env;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-boost',
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8080 }
  });
});
after(() => env.cleanup());
beforeEach(() => env.clearFirestore());

const ana = () => env.authenticatedContext('ana').firestore();
const beto = () => env.authenticatedContext('beto').firestore();
const anon = () => env.unauthenticatedContext().firestore();

const PERFIL = { name: 'Ana', role: 'atleta', bw: 68, hgt: 172, age: 26, goals: ['fuerza'], level: 'inter',
  exs: ['Sentadilla'], custom: [], loads: { Sentadilla: 120 }, week: [0, 1, 3], unit: 'kg', remind: true };
const SERIE = { id: '1790000000000-abc123', exercise: 'Press banca', load: 80, setNo: 1, reps: [0.61, 0.58, 0.52], at: 1790000000000 };

test('cada uno escribe y lee su perfil', async () => {
  await assertSucceeds(setDoc(doc(ana(), 'users/ana'), { ...PERFIL, updatedAt: serverTimestamp() }));
  await assertSucceeds(getDoc(doc(ana(), 'users/ana')));
});

test('nadie lee ni escribe el perfil de otro', async () => {
  await env.withSecurityRulesDisabled(c => setDoc(doc(c.firestore(), 'users/ana'), PERFIL));
  await assertFails(getDoc(doc(beto(), 'users/ana')));
  await assertFails(setDoc(doc(beto(), 'users/ana'), PERFIL));
  await assertFails(getDoc(doc(anon(), 'users/ana')));
});

test('no se puede meter el plan a mano ni campos raros', async () => {
  await assertFails(setDoc(doc(ana(), 'users/ana'), { ...PERFIL, plan: 'elite' }));
  await assertFails(setDoc(doc(ana(), 'users/ana'), { ...PERFIL, role: 'admin' }));
  await assertFails(setDoc(doc(ana(), 'users/ana'), { ...PERFIL, bw: 'mucho' }));
});

test('series: crear propias, no editar, borrar sí', async () => {
  const ref = doc(ana(), 'users/ana/sets/' + SERIE.id);
  await assertSucceeds(setDoc(ref, SERIE));
  // Reintento offline idéntico: pasa.
  await assertSucceeds(setDoc(ref, SERIE));
  // Cambiarle la carga después: no.
  await assertFails(setDoc(ref, { ...SERIE, load: 200 }));
  await assertSucceeds(deleteDoc(ref));
});

test('series: id tiene que coincidir y los datos ser válidos', async () => {
  await assertFails(setDoc(doc(ana(), 'users/ana/sets/otro-id'), SERIE));
  await assertFails(setDoc(doc(ana(), 'users/ana/sets/' + SERIE.id), { ...SERIE, reps: 'nada' }));
  await assertFails(setDoc(doc(beto(), 'users/ana/sets/' + SERIE.id), SERIE));
});

test('soporte: se crea con el uid propio y no se lee', async () => {
  const ok = env.authenticatedContext('ana', { email: 'ana@x.com', email_verified: true }).firestore();
  const day = Math.floor(Date.now() / 864e5);
  const msg = { uid: 'ana', email: 'ana@x.com', topic: 'Sensor', message: 'No me conecta el sensor', createdAt: serverTimestamp() };
  await assertSucceeds(setDoc(doc(ok, `support/ana_${day}_1`), msg));
  await assertFails(setDoc(doc(ok, `support/ana_${day}_2`), { ...msg, uid: 'beto' }));
  await assertFails(setDoc(doc(ok, `support/beto_${day}_2`), msg), 'id de otro');
  await assertFails(setDoc(doc(ok, `support/ana_${day}_2`), { ...msg, email: 'otro@x.com' }), 'email ajeno');
  await assertFails(setDoc(doc(ok, `support/ana_${day}_2`), { ...msg, message: 'corto' }));
  await assertFails(setDoc(doc(anon(), `support/ana_${day}_2`), { ...msg, uid: null }));
  await assertFails(getDoc(doc(ok, `support/ana_${day}_1`)));
});

test('soporte: sin email confirmado no, y como mucho 3 por día', async () => {
  const day = Math.floor(Date.now() / 864e5);
  const msg = { uid: 'ana', topic: 'Sensor', message: 'No me conecta el sensor', createdAt: serverTimestamp() };
  const sin = env.authenticatedContext('ana', { email: 'ana@x.com', email_verified: false }).firestore();
  await assertFails(setDoc(doc(sin, `support/ana_${day}_1`), msg), 'email sin confirmar');
  const g = env.authenticatedContext('ana', { email: 'ana@x.com', firebase: { sign_in_provider: 'google.com' } }).firestore();
  for (const n of [1, 2, 3]) await assertSucceeds(setDoc(doc(g, `support/ana_${day}_${n}`), msg));
  await assertFails(setDoc(doc(g, `support/ana_${day}_4`), msg), 'cuarto del día');
  await assertFails(setDoc(doc(g, `support/ana_${day}_1`), msg), 'pisar uno ya mandado');
  await assertFails(addDoc(collection(g, 'support'), msg), 'id al azar');
  await assertFails(setDoc(doc(g, `support/ana_${day - 5}_1`), msg), 'día viejo');
});

test('nova/{uid} es solo del servidor', async () => {
  await assertFails(getDoc(doc(ana(), 'nova/ana')));
  await assertFails(setDoc(doc(ana(), 'nova/ana'), { n: 0 }));
});

test('cualquier otra colección está cerrada', async () => {
  await assertFails(setDoc(doc(ana(), 'admin/x'), { a: 1 }));
  await assertFails(getDoc(doc(ana(), 'subscriptions/ana')));
});

test('perfil: consentimientos como texto corto, nada raro', async () => {
  await assertSucceeds(setDoc(doc(ana(), 'users/ana'), { ...PERFIL, consentV: '2026-09-26', aiConsentV: '2026-09-26' }));
  await assertFails(setDoc(doc(ana(), 'users/ana'), { ...PERFIL, aiConsentV: true }));
  await assertFails(setDoc(doc(ana(), 'users/ana'), { ...PERFIL, consentV: 'x'.repeat(40) }));
});

test('perfil: la rutina de Nova se guarda con campos conocidos', async () => {
  const routine = { focus: 'Rugby', season: 'Pretemporada', days: 3, weeks: 6, sport: true };
  await assertSucceeds(setDoc(doc(ana(), 'users/ana'), { ...PERFIL, routine }));
  await assertFails(setDoc(doc(ana(), 'users/ana'), { ...PERFIL, routine: { ...routine, plan: 'elite' } }));
  // Rutina v2: respuestas del formulario + explicación de Nova, con topes.
  const v2 = { v: 2, mode: 'sport', focus: 'rugby', pos: 'tercera', season: 'pre', match: 5, field: 3, days: 3, mins: 60, prio: 'contacto', inj: ['rodilla'], eq: 'completo', weeks: 6, start: 1790000000000, why: 'Porque sí.' };
  await assertSucceeds(setDoc(doc(ana(), 'users/ana'), { ...PERFIL, routine: v2 }));
  await assertFails(setDoc(doc(ana(), 'users/ana'), { ...PERFIL, routine: { ...v2, why: 'x'.repeat(601) } }));
  await assertFails(setDoc(doc(ana(), 'users/ana'), { ...PERFIL, routine: { ...v2, inj: Array(9).fill('rodilla') } }));
  // Rutina personalizada y lista de rutinas guardadas (hasta 8).
  const custom = { kind: 'custom', id: 'c1', name: 'Mi fuerza', weeks: 6, start: 1790000000000, plan: [{ dow: 0, name: 'Piernas', items: [{ n: 'Sentadilla', s: 4, r: 5 }] }] };
  await assertSucceeds(setDoc(doc(ana(), 'users/ana'), { ...PERFIL, routine: custom, routines: [custom, { ...v2, id: 'r1', name: 'Rugby' }] }));
  await assertFails(setDoc(doc(ana(), 'users/ana'), { ...PERFIL, routines: Array(9).fill(custom) }));
  await assertFails(setDoc(doc(ana(), 'users/ana'), { ...PERFIL, routine: { ...custom, name: 'x'.repeat(41) } }));
});
