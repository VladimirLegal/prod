import React from 'react';
import { NavLink, Routes, Route, Navigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Users as UsersIcon,
  FileText,
  ShieldCheck,
  FileCode,
  MessageSquare,
  Activity,
  Settings as SettingsIcon,
  BadgeCheck,
} from './icons';

import Dashboard from './Dashboard';
import Users from './Users';
import Documents from './Documents';
import Consents from './Consents';
import Templates from './Templates';
import Feedback from './Feedback';
import Audit from './Audit';
import Settings from './Settings';
import Roles from './Roles';
import AdminAPI from '../../api/admin';

export const AdminSessionContext = React.createContext({ user: null, loading: true });

const navItems = [
  { to: '', label: 'Дашборд', icon: LayoutDashboard },
  { to: 'users', label: 'Пользователи', icon: UsersIcon },
  { to: 'documents', label: 'Документы', icon: FileText },
  { to: 'consents', label: 'Согласия ПД', icon: ShieldCheck },
  { to: 'templates', label: 'Шаблоны', icon: FileCode },
  { to: 'feedback', label: 'Обратная связь', icon: MessageSquare },
  { to: 'audit', label: 'Активность', icon: Activity },
  { to: 'settings', label: 'Настройки', icon: SettingsIcon },
  { to: 'roles', label: 'Роли', icon: BadgeCheck },
];

function SidebarLink({ item }) {
  return (
    <NavLink
      to={item.to}
      end={item.to === ''}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
          isActive
            ? 'bg-blue-100 text-blue-700'
            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
        }`
      }
    >
      <item.icon className="h-4 w-4" />
      <span>{item.label}</span>
    </NavLink>
  );
}

function AdminApp() {
  const [session, setSession] = React.useState({ user: null, loading: true });

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await AdminAPI.whoAmI();
        if (!cancelled) {
          setSession({ user: data.user || null, loading: false });
        }
      } catch (err) {
        if (!cancelled) setSession({ user: null, loading: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AdminSessionContext.Provider value={session}>
      <div className="flex gap-6">
        <aside className="w-64 shrink-0 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="mb-6">
            <h1 className="text-lg font-semibold text-gray-800">Админ-панель</h1>
            <p className="text-sm text-gray-500">Legal Portal</p>
          </div>
          <nav className="space-y-1">
            {navItems.map((item) => (
              <SidebarLink key={item.to} item={item} />
            ))}
          </nav>
        </aside>
        <main className="flex-1">
          <Routes>
            <Route index element={<Dashboard />} />
            <Route path="users" element={<Users />} />
            <Route path="documents" element={<Documents />} />
            <Route path="consents" element={<Consents />} />
            <Route path="templates" element={<Templates />} />
            <Route path="feedback" element={<Feedback />} />
            <Route path="audit" element={<Audit />} />
            <Route path="settings" element={<Settings />} />
            <Route path="roles" element={<Roles />} />
            <Route path="*" element={<Navigate to="." replace />} />
          </Routes>
        </main>
      </div>
    </AdminSessionContext.Provider>
  );
}

export default AdminApp;