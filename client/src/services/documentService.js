// c:\legal-portal\client\src\services\documentService.js
export async function saveDraft(docId, html, changeNote) {
  const res = await fetch(`/api/docs/${docId}/drafts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ html, changeNote })
  });
  if (!res.ok) throw new Error("saveDraft failed");
  return res.json();
}

export async function listVersions(docId) {
  const res = await fetch(`/api/docs/${docId}/versions`);
  if (!res.ok) throw new Error("listVersions failed");
  return res.json();
}

export async function getDiff(docId, from, to) {
  const res = await fetch(`/api/docs/${docId}/diff?from=${from}&to=${to}`);
  if (!res.ok) throw new Error("getDiff failed");
  return res.json();
}

export async function exportPdf(docId, html) {
  const res = await fetch(`/api/docs/${docId}/export/pdf`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ html })
  });
  if (!res.ok) throw new Error("exportPdf failed");
  return res.blob();
}
