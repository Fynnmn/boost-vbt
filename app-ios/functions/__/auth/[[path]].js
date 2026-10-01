// Ingreso con Google en la web: la ventana de Firebase se sirve desde nuestro propio
// dominio (app.getboost.fit/__/auth/*) y se reenvía a firebaseapp.com. Si se abre en
// otro dominio, Brave y Safari (iPhone) bloquean el almacenamiento entre sitios y la
// ventana queda cargando para siempre. Es la opción "proxy" de la guía de Firebase.
const FIREBASE_HOST = 'https://boost-vbt-app.firebaseapp.com';

export async function onRequest({ request }) {
  const url = new URL(request.url);
  const res = await fetch(FIREBASE_HOST + url.pathname + url.search, {
    method: request.method,
    headers: request.headers,
    body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
    redirect: 'manual'
  });
  return new Response(res.body, res);
}
