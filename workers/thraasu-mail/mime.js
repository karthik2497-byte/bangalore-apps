// One email as raw MIME: plain text plus HTML, UTF-8, base64 bodies and an encoded subject,
// so Malayalam shop names survive any mail server.
const b64 = s => { let bin = ''; for (const byte of new TextEncoder().encode(s)) bin += String.fromCharCode(byte); return btoa(bin); };
const wrap = s => s.replace(/.{76}/g, '$&\r\n');

export function mime({ from, to, subject, text, html }) {
  const boundary = 'b' + crypto.randomUUID();
  const part = (type, body) => [`--${boundary}`, `Content-Type: ${type}; charset=utf-8`, 'Content-Transfer-Encoding: base64', '', wrap(b64(body))];
  return [
    `From: Thraasu <${from}>`, `To: ${to}`, `Subject: =?UTF-8?B?${b64(subject)}?=`,
    `Date: ${new Date().toUTCString()}`, `Message-ID: <${crypto.randomUUID()}@tinkerhouse.uk>`,
    'MIME-Version: 1.0', `Content-Type: multipart/alternative; boundary="${boundary}"`, '',
    ...part('text/plain', text), ...part('text/html', html), `--${boundary}--`, '',
  ].join('\r\n');
}
