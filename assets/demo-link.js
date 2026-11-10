// Shows the home page's "Final demos" card (generated hidden into the This
// week block by tools/build_schedule.py) only when the Worker says the demo
// sign-up is linked: the instructor opened it, or this is a preview session.
// Any failure leaves it hidden.
import { API_BASE } from '../account/config.js';

const card = document.querySelector('[data-demo-signup]');
if (card) {
  fetch(`${API_BASE}/demos/status`, { credentials: 'include' })
    .then((r) => (r.ok ? r.json() : { linked: false }))
    .then((s) => { if (s.linked) card.classList.remove('hidden'); })
    .catch(() => {});
}
