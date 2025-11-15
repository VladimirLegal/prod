export async function safeJson(res) {
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text.slice(0,200)}`);
  }
  return res.json();
}
