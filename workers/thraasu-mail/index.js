// POST {subject, text, html} → one email to the shop operator. Failures answer 500 and log.
import { EmailMessage } from 'cloudflare:email';
import { mime } from './mime.js';

const FROM = 'alerts@tinkerhouse.uk', TO = 'ckventurestech@gmail.com';

export default {
  async fetch(request, env) {
    const m = await request.json().catch(() => null);
    if (request.method !== 'POST' || typeof m?.subject !== 'string' || typeof m.text !== 'string' || typeof m.html !== 'string') return new Response('bad', { status: 400 });
    try {
      await env.MAIL.send(new EmailMessage(FROM, TO, mime({ from: FROM, to: TO, ...m })));
      return new Response('sent');
    } catch (e) {
      console.log('send failed:', e.message);
      return new Response('failed', { status: 500 });
    }
  },
};
