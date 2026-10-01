/* ============================================================
   firebase-config.js
   ------------------------------------------------------------
   Config del proyecto de Firebase "boost-vbt-landing", creado el
   27/08/2026 desde la cuenta la cuenta del proyecto. Plan Spark
   (gratuito) — la cuota gratuita cubre muchísimo más volumen del
   que una lista de espera va a generar.

   Estos valores son PÚBLICOS por diseño: viajan en el JavaScript de
   cualquier app web de Firebase y no son un secreto. Lo que protege
   la base son las reglas de Firestore (ver README).
   ============================================================ */

export const firebaseConfig = {
  apiKey: "AIzaSyAU_AfyhUCUq_XB_uZnFsh8st3qb30Xvzc",
  authDomain: "boost-vbt-landing.firebaseapp.com",
  projectId: "boost-vbt-landing",
  storageBucket: "boost-vbt-landing.firebasestorage.app",
  messagingSenderId: "276891343859",
  appId: "1:276891343859:web:9a605a0c8a6a583ff95086",
};

/** Colección de Firestore donde se guardan los mails. */
export const COLECCION = "boost_waitlist";
