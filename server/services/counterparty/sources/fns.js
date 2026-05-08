const { request } = require('../providers/apiCloudClient');


function translateFnsIpStatus(value, text) {
  if (text) return text;

  if (value === 1 || value === '1') return 'Действующий ИП';
  if (value === 0 || value === '0') return 'Деятельность прекращена';

  return 'Статус не определён';
}

function buildFnsEmptySummary() {
  return {
    totalCount: 0,
    activeCount: 0,
    closedCount: 0,
    hasActiveIp: false,
    hasClosedIp: false,
  };
}

function buildFnsSummary(items = []) {
  const activeCount = items.filter((item) => item.isActive === true).length;
  const closedCount = items.filter((item) => item.isActive === false).length;

  return {
    totalCount: items.length,
    activeCount,
    closedCount,
    hasActiveIp: activeCount > 0,
    hasClosedIp: closedCount > 0,
  };
}

function normalizeFnsItems(values = []) {
  if (!Array.isArray(values)) return [];

  return values.map((item) => {
    const statusCode = item?.statusIP ?? item?.statusORG ?? null;
    const statusText = translateFnsIpStatus(
      item?.statusIP ?? item?.statusORG ?? null,
      item?.statusIPDesc || item?.statusORGDesc || null
    );

    const isActive =
      statusCode === 1 ||
      statusCode === '1' ||
      /действ/i.test(String(statusText || ''));

    const isClosed =
      statusCode === 0 ||
      statusCode === '0' ||
      /прекращ/i.test(String(statusText || ''));

    return {
      kind: 'fns_ip_record',
      ogrn: item?.ogrn || null,
      inn: item?.inn || null,
      fullName: item?.name || item?.abbreviated_name || null,
      registrationDate: item?.dateReg || null,
      statusCode,
      statusText,
      isActive: isActive ? true : isClosed ? false : null,
      okved: item?.okved || null,
      okvedName: item?.okved_name || null,
      edo: item?.edo || null,
      rawRecord: item,
    };
  });
}

async function checkFns(person, options = {}) {
  const innRaw = person?.inn ? String(person.inn).trim() : '';
  let response = { status: 'empty', data: [] };

  if (process.env.APICLOUD_API_TOKEN && innRaw) {
    let type = null;

    if (innRaw.length === 12) {
      type = 'search_ip';
    } else if (innRaw.length === 10) {
      type = 'search_org';
    }

    if (!type) {
      response = {
        status: 'error',
        error: 'inn_invalid_length',
        message:
          'ИНН для запроса ФНС "Прозрачный бизнес" должен содержать 10 (юрлицо) или 12 (ИП) цифр.',
        inn: innRaw,
      };
    } else {
      response = await request('pb_nalog.php', {
        type,
        inn: innRaw,
      });
    }
  }

  const rawItems = Array.isArray(response?.data) ? response.data : [];
  const found =
    response?.found === true ||
    response?.found === 'true' ||
    Number(response?.count || 0) > 0 ||
    rawItems.length > 0;

  const normalizedItems = normalizeFnsItems(rawItems);

  let status = 'empty';

  if (response?.status === 200) {
    status = found || normalizedItems.length > 0 ? 'ok' : 'empty';
  } else if (response?.status === 'error' || response?.error) {
    status = 'error';
  }

  let result = {
    status,
    provider: 'apicloud',
    items: normalizedItems,
    summary: normalizedItems.length
      ? buildFnsSummary(normalizedItems)
      : buildFnsEmptySummary(),
    raw: response,
  };

  if (status === 'error') {
    result.items = [
      {
        kind: 'fns_lookup',
        resultState: 'Ошибка проверки',
        resultStateText: 'Ошибка проверки',
        foundCount: null,
        message:
          response?.message ||
          'Не удалось получить сведения из ФНС "Прозрачный бизнес"',
        records: [],
        rawRecord: response,
      },
    ];
    result.summary = buildFnsEmptySummary();
  }

  if (status === 'empty' && normalizedItems.length === 0) {
    result.items = [
      {
        kind: 'fns_lookup',
        resultState: 'Данные получены',
        resultStateText: 'Сведения о регистрации в качестве ИП не найдены',
        foundCount: 0,
        message: 'Сведения о регистрации в качестве ИП не найдены',
        records: [],
        rawRecord: response,
      },
    ];
    result.summary = buildFnsEmptySummary();
  }

  if ((result.status === 'error' || normalizedItems.length === 0) && options.enableFallback) {
    result = {
      status: result.status === 'error' ? 'error' : 'empty',
      provider: 'kontur',
      items:
        result.items.length > 0
          ? result.items
          : innRaw
          ? [{ note: `Контур: коммерческая деятельность по ИНН ${innRaw}` }]
          : [],
      summary: result.summary || buildFnsEmptySummary(),
      raw: { apicloud: response, kontur: 'fallback_not_implemented' },
    };
  }

  return result;
}

module.exports = checkFns;
