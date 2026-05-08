import React from 'react';
import AdminAPI from '../../api/admin';
import Loader from './components/Loader';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatMoney(value) {
  if (value === undefined || value === null || value === '') return '—';

  const num = Number(String(value).replace(/\s+/g, '').replace(',', '.'));

  if (!Number.isFinite(num)) {
    return String(value);
  }

  return num.toLocaleString('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDateTime(value) {
  if (!value) return '—';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString('ru-RU');
}

function getOperationTypeLabel(value) {
  const map = {
    Spent: 'Потратили',
    Reverse: 'Вернули',
    Payment: 'Зачислили',
    ReducePayment: 'Вычли',
  };

  return map[value] || value || '—';
}

function MetricCard({ title, value, hint }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="text-sm text-gray-500">{title}</div>
      <div className="mt-2 text-2xl font-semibold text-gray-900">{value}</div>
      {hint ? <div className="mt-1 text-xs text-gray-500">{hint}</div> : null}
    </div>
  );
}

function ApiCloudBlock({
  balance,
  operations,
  filters,
  setFilters,
  loadingBalance,
  loadingOperations,
  onReloadBalance,
  onLoadOperations,
}) {
  const data = balance?.data || {};
  const items = operations?.data?.items || [];

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">API-cloud</h2>
          <p className="text-sm text-gray-500">
            Баланс, кредитный лимит и расходы по API за выбранный период.
          </p>
        </div>

        <button
          type="button"
          onClick={onReloadBalance}
          disabled={loadingBalance}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loadingBalance ? 'Обновляем…' : 'Обновить баланс'}
        </button>
      </div>

      {loadingBalance ? (
        <Loader message="Загружаем баланс API-cloud…" />
      ) : (
        <div className="grid gap-4 md:grid-cols-4">
          <MetricCard title="Баланс" value={formatMoney(data.balance)} />
          <MetricCard title="Кредитный лимит" value={formatMoney(data.credit)} />
          <MetricCard title="МГП план" value={data.mgp?.plan ?? '—'} />
          <MetricCard
            title="МГП выполнено"
            value={data.mgp?.total ?? '—'}
            hint={data.mgp?.nextCheck ? `Следующая проверка: ${data.mgp.nextCheck}` : ''}
          />
        </div>
      )}

      <div className="mt-6 rounded-xl border border-gray-200 bg-gray-50 p-4">
        <div className="mb-3 text-sm font-semibold text-gray-800">Операции за период</div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm text-gray-600">
            <span className="mb-1 block">С даты</span>
            <input
              type="date"
              value={filters.from}
              onChange={(e) => setFilters((prev) => ({ ...prev, from: e.target.value }))}
              className="rounded-lg border border-gray-300 px-3 py-2"
            />
          </label>

          <label className="text-sm text-gray-600">
            <span className="mb-1 block">По дату</span>
            <input
              type="date"
              value={filters.to}
              onChange={(e) => setFilters((prev) => ({ ...prev, to: e.target.value }))}
              className="rounded-lg border border-gray-300 px-3 py-2"
            />
          </label>

          <button
            type="button"
            onClick={onLoadOperations}
            disabled={loadingOperations}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black disabled:opacity-50"
          >
            {loadingOperations ? 'Загружаем…' : 'Получить расходы'}
          </button>
        </div>

        <p className="mt-2 text-xs text-gray-500">
          API-cloud не включает сегодняшнюю дату в отчёт, потому что отчёты формируются после 00:00.
        </p>
      </div>

      <div className="mt-5 overflow-auto rounded-xl border border-gray-200">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3">API</th>
              <th className="px-4 py-3 text-right">Операций</th>
              <th className="px-4 py-3 text-right">Оплачено</th>
              <th className="px-4 py-3 text-right">Возвращено</th>
              <th className="px-4 py-3 text-right">Итого</th>
              <th className="px-4 py-3 text-right">Средний тариф</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {items.length ? (
              items.map((item, index) => (
                <tr key={`${item.api}-${index}`}>
                  <td className="px-4 py-3 font-medium text-gray-900">{item.api || '—'}</td>
                  <td className="px-4 py-3 text-right">{item.count}</td>
                  <td className="px-4 py-3 text-right">{formatMoney(item.sumPay)}</td>
                  <td className="px-4 py-3 text-right">{formatMoney(item.sumBack)}</td>
                  <td className="px-4 py-3 text-right font-semibold">{formatMoney(item.itogo)}</td>
                  <td className="px-4 py-3 text-right">{formatMoney(item.avgTarif)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  Операции ещё не загружены.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function KonturBlock({
  balance,
  operations,
  filters,
  setFilters,
  selectedServiceId,
  setSelectedServiceId,
  loadingBalance,
  loadingOperations,
  onReloadBalance,
  onLoadOperations,
}) {
  const services = balance?.data?.items || [];
  const operationItems = operations?.data?.operations || [];
  const nextToken = operations?.data?.token || '';

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Контур</h2>
          <p className="text-sm text-gray-500">
            Баланс по подключенным услугам и операции по выбранному serviceId.
          </p>
        </div>

        <button
          type="button"
          onClick={onReloadBalance}
          disabled={loadingBalance}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loadingBalance ? 'Обновляем…' : 'Обновить баланс'}
        </button>
      </div>

      {loadingBalance ? (
        <Loader message="Загружаем баланс Контура…" />
      ) : (
        <div className="overflow-auto rounded-xl border border-gray-200">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">Услуга</th>
                <th className="px-4 py-3">Код</th>
                <th className="px-4 py-3">Продукт</th>
                <th className="px-4 py-3">Тариф</th>
                <th className="px-4 py-3 text-right">Баланс</th>
                <th className="px-4 py-3">serviceId</th>
                <th className="px-4 py-3">Операции</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {services.length ? (
                services.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {item.typeDescription || '—'}
                    </td>
                    <td className="px-4 py-3">{item.typeCode || '—'}</td>
                    <td className="px-4 py-3">{item.productCode || '—'}</td>
                    <td className="px-4 py-3">{item.tariffType || '—'}</td>
                    <td className="px-4 py-3 text-right">
                      {formatMoney(item.balance?.value)} {item.balance?.unitClass || ''}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{item.id}</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedServiceId(item.id);
                          onLoadOperations(item.id);
                        }}
                        className="rounded-lg border border-blue-200 px-3 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                      >
                        Показать
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                    Услуги не загружены.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-6 rounded-xl border border-gray-200 bg-gray-50 p-4">
        <div className="mb-3 text-sm font-semibold text-gray-800">Операции Контура</div>

        <div className="grid gap-3 lg:grid-cols-5">
          <label className="text-sm text-gray-600 lg:col-span-2">
            <span className="mb-1 block">serviceId</span>
            <input
              type="text"
              value={selectedServiceId}
              onChange={(e) => setSelectedServiceId(e.target.value)}
              placeholder="GUID услуги"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs"
            />
          </label>

          <label className="text-sm text-gray-600">
            <span className="mb-1 block">С даты</span>
            <input
              type="date"
              value={filters.from}
              onChange={(e) => setFilters((prev) => ({ ...prev, from: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            />
          </label>

          <label className="text-sm text-gray-600">
            <span className="mb-1 block">По дату</span>
            <input
              type="date"
              value={filters.to}
              onChange={(e) => setFilters((prev) => ({ ...prev, to: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            />
          </label>

          <label className="text-sm text-gray-600">
            <span className="mb-1 block">Кол-во</span>
            <input
              type="number"
              min="1"
              max="500"
              value={filters.count}
              onChange={(e) => setFilters((prev) => ({ ...prev, count: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            />
          </label>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => onLoadOperations(selectedServiceId)}
            disabled={loadingOperations || !selectedServiceId}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black disabled:opacity-50"
          >
            {loadingOperations ? 'Загружаем…' : 'Получить операции'}
          </button>

          {nextToken ? (
            <button
              type="button"
              onClick={() => onLoadOperations(selectedServiceId, nextToken)}
              disabled={loadingOperations || !selectedServiceId}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Следующая страница
            </button>
          ) : null}

          {nextToken ? (
            <span className="font-mono text-xs text-gray-500">token: {nextToken}</span>
          ) : null}
        </div>
      </div>

      <div className="mt-5 overflow-auto rounded-xl border border-gray-200">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3">Дата</th>
              <th className="px-4 py-3">Тип</th>
              <th className="px-4 py-3 text-right">Сумма</th>
              <th className="px-4 py-3">Ед.</th>
              <th className="px-4 py-3">operationId</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {operationItems.length ? (
              operationItems.map((item) => (
                <tr key={item.operationId}>
                  <td className="px-4 py-3">{formatDateTime(item.createdAt)}</td>
                  <td className="px-4 py-3">{getOperationTypeLabel(item.operationType)}</td>
                  <td className="px-4 py-3 text-right font-semibold">
                    {formatMoney(item.amount?.value)}
                  </td>
                  <td className="px-4 py-3">{item.amount?.unitClass || '—'}</td>
                  <td className="px-4 py-3 font-mono text-xs">{item.operationId || '—'}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                  Операции ещё не загружены.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ApiBalance() {
  const [activeTab, setActiveTab] = React.useState('apicloud');

  const [apiCloudBalance, setApiCloudBalance] = React.useState(null);
  const [apiCloudOperations, setApiCloudOperations] = React.useState(null);
  const [apiCloudFilters, setApiCloudFilters] = React.useState({
    from: addDaysIso(-7),
    to: addDaysIso(-1),
  });

  const [konturBalance, setKonturBalance] = React.useState(null);
  const [konturOperations, setKonturOperations] = React.useState(null);
  const [konturFilters, setKonturFilters] = React.useState({
    from: addDaysIso(-7),
    to: todayIso(),
    count: '100',
  });
  const [selectedServiceId, setSelectedServiceId] = React.useState('');

  const [loading, setLoading] = React.useState({
    apiCloudBalance: false,
    apiCloudOperations: false,
    konturBalance: false,
    konturOperations: false,
  });

  const [error, setError] = React.useState('');

  const loadApiCloudBalance = React.useCallback(async () => {
    setLoading((prev) => ({ ...prev, apiCloudBalance: true }));
    setError('');

    try {
      const response = await AdminAPI.getApiCloudBillingBalance();
      setApiCloudBalance(response);
    } catch (err) {
      setError(`API-cloud баланс: ${err.message || 'ошибка загрузки'}`);
    } finally {
      setLoading((prev) => ({ ...prev, apiCloudBalance: false }));
    }
  }, []);

  const loadApiCloudOperations = React.useCallback(async () => {
    setLoading((prev) => ({ ...prev, apiCloudOperations: true }));
    setError('');

    try {
      const response = await AdminAPI.getApiCloudBillingOperations(apiCloudFilters);
      setApiCloudOperations(response);
    } catch (err) {
      setError(`API-cloud операции: ${err.message || 'ошибка загрузки'}`);
    } finally {
      setLoading((prev) => ({ ...prev, apiCloudOperations: false }));
    }
  }, [apiCloudFilters]);

  const loadKonturBalance = React.useCallback(async () => {
    setLoading((prev) => ({ ...prev, konturBalance: true }));
    setError('');

    try {
      const response = await AdminAPI.getKonturBillingBalance();
      setKonturBalance(response);

      const firstServiceId = response?.data?.items?.[0]?.id || '';
      if (firstServiceId) {
        setSelectedServiceId((prev) => prev || firstServiceId);
      }
    } catch (err) {
      setError(`Контур баланс: ${err.message || 'ошибка загрузки'}`);
    } finally {
      setLoading((prev) => ({ ...prev, konturBalance: false }));
    }
  }, []);

  const loadKonturOperations = React.useCallback(
    async (serviceIdArg, tokenArg = '') => {
      const serviceId = String(serviceIdArg || selectedServiceId || '').trim();

      if (!serviceId) {
        setError('Контур операции: выбери serviceId.');
        return;
      }

      setLoading((prev) => ({ ...prev, konturOperations: true }));
      setError('');

      try {
        const response = await AdminAPI.getKonturBillingOperations({
          serviceId,
          from: konturFilters.from,
          to: konturFilters.to,
          count: konturFilters.count || 100,
          token: tokenArg || '',
        });

        setSelectedServiceId(serviceId);
        setKonturOperations(response);
      } catch (err) {
        setError(`Контур операции: ${err.message || 'ошибка загрузки'}`);
      } finally {
        setLoading((prev) => ({ ...prev, konturOperations: false }));
      }
    },
    [konturFilters, selectedServiceId]
  );

  React.useEffect(() => {
    loadApiCloudBalance();
    loadKonturBalance();
  }, [loadApiCloudBalance, loadKonturBalance]);

  return (
    <div className="space-y-6">
      <div className="mb-2">
        <h1 className="text-2xl font-semibold text-gray-900">Баланс API</h1>
        <p className="text-sm text-gray-500">
          Баланс и операции по API-cloud и Контур. Токены остаются только на сервере.
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setActiveTab('apicloud')}
          className={`rounded-lg px-4 py-2 text-sm font-semibold ${
            activeTab === 'apicloud'
              ? 'bg-blue-600 text-white'
              : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
          }`}
        >
          API-cloud
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('kontur')}
          className={`rounded-lg px-4 py-2 text-sm font-semibold ${
            activeTab === 'kontur'
              ? 'bg-blue-600 text-white'
              : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
          }`}
        >
          Контур
        </button>
      </div>

      {activeTab === 'apicloud' ? (
        <ApiCloudBlock
          balance={apiCloudBalance}
          operations={apiCloudOperations}
          filters={apiCloudFilters}
          setFilters={setApiCloudFilters}
          loadingBalance={loading.apiCloudBalance}
          loadingOperations={loading.apiCloudOperations}
          onReloadBalance={loadApiCloudBalance}
          onLoadOperations={loadApiCloudOperations}
        />
      ) : (
        <KonturBlock
          balance={konturBalance}
          operations={konturOperations}
          filters={konturFilters}
          setFilters={setKonturFilters}
          selectedServiceId={selectedServiceId}
          setSelectedServiceId={setSelectedServiceId}
          loadingBalance={loading.konturBalance}
          loadingOperations={loading.konturOperations}
          onReloadBalance={loadKonturBalance}
          onLoadOperations={loadKonturOperations}
        />
      )}
    </div>
  );
}

export default ApiBalance;