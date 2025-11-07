const fs = require('fs');
const iconv = require('iconv-lite');
const xml2js = require('xml2js');

const xmlPath = './20250804_ED807_full.xml';      // Путь к XML-файлу
const outputPath = './bankDirectory.json';        // Куда сохранить JSON

const parser = new xml2js.Parser({ explicitArray: false });

// Читаем и декодируем XML (Windows-1251)
const buffer = fs.readFileSync(xmlPath);
const decodedXml = iconv.decode(buffer, 'windows-1251');

// Парсим XML и извлекаем данные
parser.parseString(decodedXml, (err, result) => {
  if (err) {
    console.error('Ошибка парсинга XML:', err);
    return;
  }

  const entries = result.ED807.BICDirectoryEntry;
  const directory = {};

  entries.forEach((entry) => {
    const bik = entry?.$?.BIC?.trim();
    const name = entry?.ParticipantInfo?.$?.NameP?.trim() || '';
    const ks = entry?.Accounts?.$?.Account?.trim() || '';

    // Пропускаем, если нет БИК или корр. счёта
    if (!bik || !ks) return;

    directory[bik] = {
      name,
      ks
    };
  });

  fs.writeFileSync(outputPath, JSON.stringify(directory, null, 2), 'utf8');
  console.log(`✔ bankDirectory.json создан. Банков: ${Object.keys(directory).length}`);
});
