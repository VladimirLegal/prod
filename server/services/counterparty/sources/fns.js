const { request } = require('../providers/apiCloudClient');

/**
 * Проверка контрагента по ФНС "Прозрачный бизнес" через api-cloud -> pb_nalog.php
 *
 * Логика:
 * - если ИНН 12 знаков — считаем, что это ИП и шлём type=search_ip
 * - если ИНН 10 знаков — считаем, что это юрлицо и шлём type=search_org
 * - если длина другая — возвращаем status=error с пояснением
 *
 * Ответ api-cloud:
 * {
 *   "status": 200,
 *   "found": true | false,
 *   "count": 1,
 *   "data": [ ... ],
 *   "inquiry": { ... }
 * }
 *
 * Мы нормализуем в формат:
 * {
 *   status: 'ok' | 'empty' | 'error',
 *   provider: 'apicloud' | 'kontur',
 *   items: [...],
 *   raw: <исходный ответ>
 * }
 */
async function checkFns(person, options = {}) {
  const innRaw = person?.inn ? String(person.inn).trim() : '';
  let response = { status: 'empty', data: [] };

  // Если есть токен и ИНН — пробуем запрос к api-cloud
  if (process.env.APICLOUD_API_TOKEN && innRaw) {
    let type = null;

    if (innRaw.length === 12) {
      // Индивидуальный предприниматель
      type = 'search_ip';
    } else if (innRaw.length === 10) {
      // Юридическое лицо
      type = 'search_org';
    }

    if (!type) {
      // Некорректная длина ИНН — не шлём запрос, сразу формируем "ошибку"
      response = {
        status: 'error',
        error: 'inn_invalid_length',
        message:
          'ИНН для запроса ФНС "Прозрачный бизнес" должен содержать 10 (юрлицо) или 12 (ИП) цифр.',
        inn: innRaw,
      };
    } else {
      // api-cloud уже обёрнут в apiCloudClient: добавляет token, baseUrl и timeout
      response = await request('pb_nalog.php', {
        type,
        inn: innRaw,
      });
    }
  }

  const apiStatus = response?.status;
  const items = Array.isArray(response?.data) ? response.data : [];
  const found = !!response?.found;

  let status;

  // Если api-cloud вернул HTTP 200 и status = 200 в теле
  if (apiStatus === 200) {
    status = found && items.length > 0 ? 'ok' : 'empty';
  } else if (apiStatus === 'error' || response?.error) {
    status = 'error';
  } else {
    // На всякий случай дефолт
    status = 'empty';
  }

  let result = {
    status,
    provider: 'apicloud',
    items,
    raw: response,
  };

  // Fallback на Контур, если включён options.enableFallback
  if ((result.status === 'error' || result.items.length === 0) && options.enableFallback) {
    result = {
      status: result.status === 'error' ? 'error' : 'empty',
      provider: 'kontur',
      items:
        result.items.length > 0
          ? result.items
          : innRaw
          ? [{ note: `Контур: прозрачный бизнес по ИНН ${innRaw}` }]
          : [],
      raw: { apicloud: response, kontur: 'fallback_not_implemented' },
    };
  }

  return result;
}

module.exports = checkFns;
