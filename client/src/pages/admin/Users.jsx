import React from 'react';
import { Pencil, Lock, Unlock } from './icons';

import AdminAPI from '../../api/admin';
import DataTable from './components/DataTable';
import FiltersBar from './components/FiltersBar';
import Pagination from './components/Pagination';
import StatusPill from './components/StatusPill';
import Loader from './components/Loader';
import { AdminSessionContext } from './AdminApp';
import { formatDateTime } from '../../utils/date';

const ROLE_OPTIONS = [
  { value: '', label: 'Все роли' },
  { value: 'user', label: 'Пользователь' },
  { value: 'manager', label: 'Менеджер' },
  { value: 'admin', label: 'Администратор' },
];

const STATUS_OPTIONS = [
  { value: '', label: 'Все статусы' },
  { value: 'active', label: 'Активен' },
  { value: 'blocked', label: 'Заблокирован' },
  { value: 'deleted', label: 'Удалён' },
];
const PROVIDER_LABELS = {
  yandex: 'Яндекс ID',
  vk: 'VK ID',
};

function getUserDisplayName(user) {
  return user.display_name || user.full_name || '—';
}

function getUserEmailLabel(user) {
  return user.email || 'Email не указан';
}

function getAuthProviders(user) {
  const providers = Array.isArray(user.authProviders)
    ? user.authProviders
    : Array.isArray(user.auth_providers)
      ? user.auth_providers
      : [];

  const result = [];

  if (user.email) {
    result.push('email');
  }

  for (const provider of providers) {
    if (provider && !result.includes(provider)) {
      result.push(provider);
    }
  }

  return result;
}

function renderAuthProviderBadge(provider) {
  const label = provider === 'email' ? 'Email' : (PROVIDER_LABELS[provider] || provider);

  const classes = provider === 'vk'
    ? 'bg-blue-100 text-blue-700'
    : provider === 'yandex'
      ? 'bg-yellow-100 text-yellow-800'
      : 'bg-gray-100 text-gray-700';

  return (
    <span
      key={provider}
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${classes}`}
    >
      {label}
    </span>
  );
}

function useUsersData(filters) {
  const [state, setState] = React.useState({ loading: true, error: null, items: [], total: 0 });

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setState((prev) => ({ ...prev, loading: true, error: null }));
        const response = await AdminAPI.listUsers(filters);
        if (!cancelled) {
          setState({ loading: false, error: null, items: response.items || [], total: response.total || 0 });
        }
      } catch (err) {
        if (!cancelled) {
          setState({ loading: false, error: err.message || 'Ошибка загрузки', items: [], total: 0 });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filters.query, filters.role, filters.status, filters.limit, filters.offset, filters.sort]);

  return state;
}

function EditUserModal({ user, onClose, onSave, allowRoleEdit }) {
  const [form, setForm] = React.useState({
    role: user.role,
    status: user.status,
    display_name: user.display_name || '',
    phone: user.phone || '',
  });
  const [saving, setSaving] = React.useState(false);
  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      const payload = {};
      if (allowRoleEdit) payload.role = form.role;
      payload.status = form.status;
      payload.display_name = form.display_name;
      payload.phone = form.phone;
      await onSave(payload);
      onClose();
    } catch (err) {
      // eslint-disable-next-line no-alert
      alert(err.message || 'Не удалось обновить пользователя');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg">
        <h2 className="mb-4 text-lg font-semibold text-gray-800">Редактирование пользователя</h2>
        <form onSubmit={handleSubmit} className="space-y-4 text-sm">
          <div>
            <label className="mb-1 block text-gray-600">Email</label>
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-gray-700">{user.email}</div>
          </div>
          {allowRoleEdit && (
            <div>
              <label className="mb-1 block text-gray-600">Роль</label>
              <select
                name="role"
                value={form.role}
                onChange={handleChange}
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
              >
                {ROLE_OPTIONS.filter((opt) => opt.value).map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="mb-1 block text-gray-600">Статус</label>
            <select
              name="status"
              value={form.status}
              onChange={handleChange}
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            >
              {STATUS_OPTIONS.filter((opt) => opt.value).map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-gray-600">Отображаемое имя</label>
            <input
              name="display_name"
              value={form.display_name}
              onChange={handleChange}
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-gray-600">Телефон</label>
            <input
              name="phone"
              value={form.phone}
              onChange={handleChange}
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-200 px-4 py-2 text-gray-600 hover:bg-gray-50"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Сохранить
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Users() {
  const { user: sessionUser } = React.useContext(AdminSessionContext);
  const isAdmin = sessionUser?.role === 'admin';

  const [filters, setFilters] = React.useState({
    query: '',
    role: '',
    status: '',
    limit: 20,
    offset: 0,
    sort: 'created_at.desc',
  });
  const [editingUser, setEditingUser] = React.useState(null);

  const { items, total, loading, error } = useUsersData(filters);

  const sortKey = filters.sort.split('.')[0];
  const sortDirection = filters.sort.split('.')[1] || 'desc';

  const handleSort = (key) => {
    setFilters((prev) => {
      if (prev.sort.startsWith(key)) {
        const nextDir = prev.sort.endsWith('.desc') ? 'asc' : 'desc';
        return { ...prev, sort: `${key}.${nextDir}`, offset: 0 };
      }
      return { ...prev, sort: `${key}.desc`, offset: 0 };
    });
  };

  const refresh = React.useCallback(() => {
    setFilters((prev) => ({ ...prev }));
  }, []);

  const handleSave = async (payload) => {
    if (!editingUser) return;
    await AdminAPI.updateUser(editingUser.id, payload);
    refresh();
  };

  const handleBlockToggle = async (user) => {
    try {
      if (user.status === 'blocked') {
        await AdminAPI.unblockUser(user.id);
      } else {
        await AdminAPI.blockUser(user.id);
      }
      refresh();
    } catch (err) {
      // eslint-disable-next-line no-alert
      alert(err.message || 'Не удалось обновить статус');
    }
  };

  const handleDeleteUser = async (user) => {
    if (String(user.id) === String(sessionUser?.id)) {
      alert('Нельзя удалить самого себя.');
      return;
    }

    if (!window.confirm('Удалить пользователя? Это мягкое удаление: пользователь не сможет войти, но история сохранится.')) {
      return;
    }

    try {
      await AdminAPI.deleteUser(user.id);
      refresh();
    } catch (err) {
      alert(err.message || 'Не удалось удалить пользователя');
    }
  };

  const handleRestoreUser = async (user) => {
    try {
      await AdminAPI.restoreUser(user.id);
      refresh();
    } catch (err) {
      alert(err.message || 'Не удалось восстановить пользователя');
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Пользователи</h1>
        <p className="text-sm text-gray-500">Поиск, фильтры и изменение статусов</p>
      </div>

      <FiltersBar>
        <input
          type="search"
          placeholder="Поиск по email, имени или телефону"
          value={filters.query}
          onChange={(e) => setFilters((prev) => ({ ...prev, query: e.target.value, offset: 0 }))}
          className="w-64 rounded-lg border border-gray-300 px-3 py-2"
        />
        <select
          value={filters.role}
          onChange={(e) => setFilters((prev) => ({ ...prev, role: e.target.value, offset: 0 }))}
          className="rounded-lg border border-gray-300 px-3 py-2"
        >
          {ROLE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <select
          value={filters.status}
          onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value, offset: 0 }))}
          className="rounded-lg border border-gray-300 px-3 py-2"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </FiltersBar>

      {loading ? (
        <Loader />
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">{error}</div>
      ) : (
        <>
          <DataTable
            columns={[
              {
                key: 'email',
                label: 'Email',
                sortable: true,
                render: (user) => (
                  <span className={user.email ? 'text-gray-800' : 'text-gray-400 italic'}>
                    {getUserEmailLabel(user)}
                  </span>
                ),
              },
              {
                key: 'display_name',
                label: 'ФИО / имя',
                sortable: true,
                render: (user) => getUserDisplayName(user),
              },
              {
                key: 'phone',
                label: 'Телефон',
                render: (user) => user.phone || '—',
              },
              {
                key: 'role',
                label: 'Роль',
                sortable: true,
                render: (user) => <StatusPill value={user.role} kind="role" />, 
              },
              {
                key: 'status',
                label: 'Статус',
                sortable: true,
                render: (user) => <StatusPill value={user.status} kind="status" />, 
              },
              {
                key: 'authProviders',
                label: 'Способы входа',
                render: (user) => {
                  const providers = getAuthProviders(user);

                  if (!providers.length) {
                    return <span className="text-gray-400">—</span>;
                  }

                  return (
                    <div className="flex flex-wrap gap-1">
                      {providers.map(renderAuthProviderBadge)}
                    </div>
                  );
                },
              },
              {
                key: 'created_at',
                label: 'Создан',
                sortable: true,
                render: (user) => formatDateTime(user.created_at),
              },
              {
                key: 'last_login_at',
                label: 'Последний вход',
                sortable: true,
                render: (user) => formatDateTime(user.last_login_at),
              },
              {
                key: 'actions',
                label: '',
                render: (user) => {
                  const isSelf = String(user.id) === String(sessionUser?.id);

                  return (
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingUser(user)}
                        className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1 text-xs text-gray-600 hover:bg-gray-50"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Редактировать
                      </button>

                      {user.status === 'deleted' ? (
                        isAdmin && (
                          <button
                            type="button"
                            onClick={() => handleRestoreUser(user)}
                            className="inline-flex items-center gap-1 rounded-lg border border-green-200 px-3 py-1 text-xs text-green-700 hover:bg-green-50"
                          >
                            <Unlock className="h-3.5 w-3.5" />
                            Восстановить
                          </button>
                        )
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => handleBlockToggle(user)}
                            disabled={isSelf}
                            title={isSelf ? 'Нельзя заблокировать самого себя' : ''}
                            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {user.status === 'blocked' ? (
                              <>
                                <Unlock className="h-3.5 w-3.5" /> Разблокировать
                              </>
                            ) : (
                              <>
                                <Lock className="h-3.5 w-3.5" /> Заблокировать
                              </>
                            )}
                          </button>

                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() => handleDeleteUser(user)}
                              disabled={isSelf}
                              title={isSelf ? 'Нельзя удалить самого себя' : ''}
                              className="inline-flex items-center rounded-lg border border-red-200 px-3 py-1 text-xs text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Удалить
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  );
                },
              },
            ]}
            data={items}
            sortKey={sortKey}
            sortDirection={sortDirection}
            onSort={handleSort}
          />
          <Pagination
            total={total}
            limit={filters.limit}
            offset={filters.offset}
            onChange={(nextOffset) => setFilters((prev) => ({ ...prev, offset: nextOffset }))}
          />
        </>
      )}

      {editingUser && (
        <EditUserModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onSave={handleSave}
          allowRoleEdit={isAdmin}
        />
      )}
    </div>
  );
}

export default Users;