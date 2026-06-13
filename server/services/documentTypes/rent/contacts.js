function buildContactsHtml(list) {
  const esc = (s) => String(s ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  if (!Array.isArray(list) || !list.length) return '—';

  const rows = list.map(p => {
    const name  = esc((p?.fullName || '').trim());
    const phone = (p?.phone || '').trim();
    const mail  = (p?.email || '').trim();

    const parts = [];
    if (phone) parts.push(`тел. ${esc(phone)}`);
    if (mail)  parts.push(`email ${esc(mail)}`);

    if (!parts.length) return ''; // у человека нет ни телефона, ни email — пропускаем
    return (name ? `${name}: ` : '') + parts.join('; ');
  }).filter(Boolean);

  return rows.length ? rows.join('<br>') : '—';
}

module.exports = {
  buildContactsHtml,
};