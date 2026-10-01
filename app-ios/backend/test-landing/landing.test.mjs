// Reglas de la lista de espera de la landing (landing/firestore.rules), contra el emulador.
import { test, before, after } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';

let env;
before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-landing', firestore: { rules: readFileSync('../../landing/firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 } });
});
after(() => env.cleanup());
const reg = email => ({ email, origen: 'directo', fecha: new Date().toISOString(), idioma: 'es', referrer: 'directo' });

test('landing: alta con id = mail en minúsculas; repetido rechazado; id al azar rechazado', async () => {
  const db = env.unauthenticatedContext().firestore();
  await assertSucceeds(setDoc(doc(db, 'boost_waitlist', 'ana@mail.com'), reg('Ana@Mail.com')));
  await assertFails(setDoc(doc(db, 'boost_waitlist', 'ana@mail.com'), reg('Ana@Mail.com')));
  await assertFails(setDoc(doc(db, 'boost_waitlist', 'X7fh2kq9'), reg('ana@mail.com')));
  await assertFails(setDoc(doc(db, 'boost_waitlist', 'otro@mail.com'), reg('ana@mail.com')));
});
