import { guardarMail } from './waitlist.js';

const form = document.querySelector('#waitlistForm');
const msg = document.querySelector('#formMsg');
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const input = form.querySelector('#email');
  const button = form.querySelector('button');
  const email = input.value.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    msg.dataset.state = 'err';
    msg.textContent = 'Revisá tu correo: debe tener un formato como vos@ejemplo.com.';
    input.setAttribute('aria-invalid', 'true');
    input.focus();
    return;
  }
  input.removeAttribute('aria-invalid');
  button.disabled = true;
  msg.dataset.state = '';
  msg.textContent = 'Registrando…';
  try {
    const result = await guardarMail(email, location.hash || 'directo');
    const pending = result.destino === 'pendiente' || result.destino === 'local';
    msg.dataset.state = pending ? 'pending' : 'ok';
    msg.textContent = pending
      ? 'Tu correo quedó guardado en este navegador, pero todavía no pudimos enviarlo. Vamos a reintentar cuando vuelvas a entrar.'
      : result.repetido
        ? 'Ya estás en la lista. Te avisaremos cuando haya novedades.'
        : '¡Ya estás en la lista! Te vamos a contar los próximos avances de BOOST.';
    form.reset();
  } catch {
    msg.dataset.state = 'err';
    msg.textContent = 'No pudimos completar el registro. Probá de nuevo más tarde.';
  } finally {
    button.disabled = false;
  }
});
