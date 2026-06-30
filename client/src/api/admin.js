const defaultHeaders = { 'Content-Type': 'application/json' };

async function request(path, { method = 'GET', body, headers = {}, ...rest } = {}) {
  const init = {
    method,
    credentials: 'include',
    headers: { ...defaultHeaders, ...headers },
    ...rest,
  };
  if (body !== undefined && body !== null) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
  }
  const response = await fetch(`/api/admin${path}`, init);
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch (err) {
    throw new Error(`Некорректный ответ сервера (${response.status})`);
  }
  if (!response.ok || data?.ok === false) {
    const errorCode = data?.error || `HTTP_${response.status}`;
    const error = new Error(errorCode);
    error.status = response.status;
    error.payload = data;
    throw error;
  }
  return data;
}

const AdminAPI = {
  whoAmI: () => request('/whoami'),
  listUsers: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/users${query ? `?${query}` : ''}`);
  },
  updateUser: (id, payload) => request(`/users/${id}`, { method: 'PATCH', body: payload }),
  blockUser: (id) => request(`/users/${id}/block`, { method: 'POST' }),
  unblockUser: (id) => request(`/users/${id}/unblock`, { method: 'POST' }),
  deleteUser: (id) => request(`/users/${id}/delete`, { method: 'POST' }),
  restoreUser: (id) => request(`/users/${id}/restore`, { method: 'POST' }),
  userActivity: (id, params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/users/${id}/activity${query ? `?${query}` : ''}`);
  },
  listDocuments: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/documents${query ? `?${query}` : ''}`);
  },
  deleteDocument: (id) => request(`/documents/${id}`, { method: 'DELETE' }),
  exportDocument: (id, format) => request(`/documents/${id}/export`, { method: 'POST', body: { format } }),
  listConsents: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/consents${query ? `?${query}` : ''}`);
  },
  getConsent: (id) => request(`/consents/${id}`),
  listTemplates: () => request('/templates'),
  getTemplate: (id) => request(`/templates/${id}`),
  updateTemplate: (id, payload) => request(`/templates/${id}`, { method: 'PUT', body: payload }),
  listFeedback: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/feedback${query ? `?${query}` : ''}`);
  },
  updateFeedbackStatus: (id, status) => request(`/feedback/${id}`, { method: 'PATCH', body: { status } }),
  addFeedbackNote: (id, text) => request(`/feedback/${id}/note`, { method: 'POST', body: { text } }),
  listFeedbackNotes: (id) => request(`/feedback/${id}/notes`),
  listAudit: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/audit${query ? `?${query}` : ''}`);
  },
    getSettings: () => request('/settings'),
    updateSettings: (payload) => request('/settings', { method: 'PATCH', body: payload }),
    getRolesSummary: () => request('/roles'),

    getApiCloudBillingBalance: () => request('/billing/apicloud/balance'),

    getApiCloudBillingOperations: (params = {}) => {
      const query = new URLSearchParams(params).toString();
      return request(`/billing/apicloud/operations${query ? `?${query}` : ''}`);
    },

    getKonturBillingBalance: () => request('/billing/kontur/balance'),

    getKonturBillingOperations: (params = {}) => {
      const query = new URLSearchParams(params).toString();
      return request(`/billing/kontur/operations${query ? `?${query}` : ''}`);
    },
};

export default AdminAPI;
export { request as adminRequest };