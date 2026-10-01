/* ============================================================
   waitlist.js — guardado de la lista de espera
   ------------------------------------------------------------
   Un solo punto de entrada, guardarMail(), que decide a dónde va:

     · Si firebase-config.js tiene projectId  → Firestore
     · Si no                                  → localStorage

   El fallback existe para poder probar el flujo completo sin
   conectar nada, y para que la página no se rompa si Firebase no
   carga (bloqueador, red caída, cuota agotada). Perder un mail es
   malo; mostrar un error donde el usuario no puede hacer nada es
   peor, así que ante una falla de red se guarda local y se reintenta
   en la próxima visita.
   ============================================================ */

import { firebaseConfig, COLECCION } from "./firebase-config.js";

const SDK = "https://www.gstatic.com/firebasejs/10.14.1";
const PENDIENTES = "boost_waitlist_pendientes";
const hayFirebase = Boolean(firebaseConfig && firebaseConfig.projectId);

let dbPromise = null;

/** Carga el SDK una sola vez, y solo si de verdad hay que usarlo. */
function conectar() {
  if (!hayFirebase) return Promise.resolve(null);
  if (!dbPromise) {
    dbPromise = (async () => {
      const [{ initializeApp }, firestore] = await Promise.all([
        import(`${SDK}/firebase-app.js`),
        import(`${SDK}/firebase-firestore.js`),
      ]);
      const app = initializeApp(firebaseConfig);
      return { db: firestore.getFirestore(app), fs: firestore };
    })().catch((e) => {
      console.warn("Firebase no disponible, se usa el respaldo local.", e);
      dbPromise = null;
      return null;
    });
  }
  return dbPromise;
}

/* --- Respaldo local ----------------------------------------- */
function leerLocal(clave) {
  try { return JSON.parse(localStorage.getItem(clave) || "[]"); }
  catch { return []; }
}
function guardarLocal(clave, registro) {
  try {
    const previos = leerLocal(clave);
    if (previos.some((r) => r.email === registro.email)) return { repetido: true };
    previos.push(registro);
    localStorage.setItem(clave, JSON.stringify(previos));
    return { repetido: false };
  } catch {
    return { repetido: false }; // modo privado: no se puede guardar, pero no es un error del usuario
  }
}

/* El id del documento es el mail en minúsculas: las reglas lo exigen, y así un
   mail repetido choca con el que ya está en vez de crear otro documento. */
const idDe = email => String(email).trim().toLowerCase();

/* --- Reintento de lo que quedó pendiente --------------------- */
async function subirPendientes() {
  const pend = leerLocal(PENDIENTES);
  if (!pend.length) return;
  const conn = await conectar();
  if (!conn) return;
  const quedan = [];
  for (const reg of pend) {
    try {
      // Mismo id que el alta normal (antes addDoc, con id al azar: duplicaba y esquivaba las reglas).
      await conn.fs.setDoc(conn.fs.doc(conn.db, COLECCION, idDe(reg.email)), reg);
    } catch (e) {
      // Ya estaba anotado: listo, no se reintenta más.
      if (e && (e.code === "permission-denied" || e.code === "already-exists")) continue;
      quedan.push(reg);
    }
  }
  try { localStorage.setItem(PENDIENTES, JSON.stringify(quedan)); } catch {}
}
if (hayFirebase) window.addEventListener("load", () => { subirPendientes(); });

/* --- API pública --------------------------------------------- */
/* `origen` sale de location.hash y `referrer` del navegador: los dos los
   controla quien visita la página, así que entran a la base como texto
   ajeno y hay que tratarlos como tal.

   Dos riesgos concretos, ninguno teórico:

   1. INYECCIÓN DE FÓRMULAS EN LA PLANILLA. El día que estos mails se
      exporten desde la consola de Firebase a un CSV y se abran en Excel o
      Sheets, una celda que empiece con = + - @ se interpreta como fórmula
      y se ejecuta. Es la vía clásica para robar datos de una planilla ajena.
      Por eso se les antepone un apóstrofo, que es como se neutraliza.

   2. TEXTO GIGANTE. Sin tope, cualquiera puede escribir documentos enormes
      y hacer subir la cuenta de Firebase. 200 caracteres alcanzan de sobra
      para saber de qué sección vino alguien.

   El recorte se hace acá Y en las reglas de Firestore. El del navegador es
   comodidad; el que de verdad protege es el del servidor, porque nadie
   obliga a un atacante a usar este JavaScript. */
const LIMITE_TEXTO = 200;

function limpiarTexto(valor) {
  const s = String(valor ?? "").slice(0, LIMITE_TEXTO);
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

export async function guardarMail(email, origen) {
  const registro = {
    email,
    origen: limpiarTexto(origen),
    fecha: new Date().toISOString(),
    idioma: limpiarTexto(navigator.language || ""),
    referrer: limpiarTexto(document.referrer || "directo"),
  };

  if (!hayFirebase) {
    const r = guardarLocal("boost_waitlist", registro);
    return { ok: true, repetido: r.repetido, destino: "local" };
  }

  const conn = await conectar();
  if (!conn) {
    guardarLocal(PENDIENTES, registro);
    return { ok: true, repetido: false, destino: "pendiente" };
  }

  try {
    /* El id del documento es el mail normalizado: Firestore rechaza el
       segundo alta con las reglas puestas, así que el duplicado se
       resuelve sin necesidad de poder leer la colección. */
    const id = idDe(email);
    await conn.fs.setDoc(
      conn.fs.doc(conn.db, COLECCION, id),
      registro
    );
    return { ok: true, repetido: false, destino: "firestore" };
  } catch (e) {
    if (e && (e.code === "permission-denied" || e.code === "already-exists")) {
      // Con las reglas del README, un alta repetida cae acá.
      return { ok: true, repetido: true, destino: "firestore" };
    }
    guardarLocal(PENDIENTES, registro);
    return { ok: true, repetido: false, destino: "pendiente" };
  }
}
