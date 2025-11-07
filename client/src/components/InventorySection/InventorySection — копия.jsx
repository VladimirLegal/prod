import React, { useState, useEffect, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faClipboardList,
  faPlus,
  faMinus,
  faHome,
  faTimes
} from '@fortawesome/free-solid-svg-icons';
import inventoryDictionary from '../../data/inventoryDictionary.json';

// === Рубли: форматирование "1 234 руб." и парс обратно ===
function formatRubShort(n) {
  if (n === null || n === undefined || n === '') return '';
  const num = Math.round(Number(String(n).replace(/\s+/g, '').replace(',', '.')) || 0);
  return num.toLocaleString('ru-RU').replace(/\u00A0/g, ' ') + ' руб.';
}
function parseRubShortToNumber(s) {
  if (s === null || s === undefined) return null;
  const raw = String(s).replace(/[^\d.,]/g, '').replace(',', '.');
  if (!raw) return null;
  const num = Math.round(Number(raw) || 0);
  return isNaN(num) ? null : num;
}

// ⬇️ ВСТАВИТЬ ВМЕСТО текущего AutoResizeTextarea
const AutoResizeTextarea = React.forwardRef(
  ({ value, onChange, placeholder, className = '', ...rest }, ref) => {
    const innerRef = React.useRef(null);
    const textareaRef = ref || innerRef;

    React.useEffect(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    }, [value, textareaRef]);

    return (
      <textarea
        ref={textareaRef}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={`w-full p-2 text-sm leading-5 border border-gray-300 rounded-md resize-none overflow-hidden ${className}`}
        style={{ minHeight: '40px' }}
        rows={1}
        {...rest}  //* ← критично: пробрасываем onKeyDown/onFocus/onBlur и прочее */
      />
    );
  }
);


const InventorySection = ({ inventory, setInventory, roomCount, apartmentDescription, setApartmentDescription }) => {
  // Базовые типы помещений
  const baseRoomTypes = [
    'Жилая комната', 
    'Коридор', 
    'Кухня', 
    'Санузел', 
    'Балкон/лоджия'
  ];
    // Справочник отделки для Приложения №2
  const FLOOR_OPTIONS = [
    'Линолеум', 'Ламинат', 'Паркет', 'Кварц-винил',
    'Плитка ПВХ', 'Паркетная доска', 'Плитка', 'Керамогранит'
  ];
  const WALL_OPTIONS = [
    'Окраска', 'Обои бумажные', 'Обои виниловые', 'Обои флизелиновые',
    'Декоративная штукатурка', 'ПВХ панели', 'Керамическая плитка'
  ];
  const CEILING_OPTIONS = [
    'Побелка/окраска', 'Натяжной', 'Подвесной', 'ГКЛ покраска'
  ];
  const WINDOW_OPTIONS = [
    'Деревянные', 'Металлопластиковые'
  ];
  const DOOR_OPTIONS = [
    'Деревянные шпонированные', 'МДФ ламинированные', 'Двери со стеклянными вставками', 'Цельноглухие'
  ];
  // Базовые помещения, которые всегда должны быть в UI
  const DEFAULT_ROOMS = ['Жилая комната', 'Кухня', 'Коридор', 'Санузел', 'Балкон/лоджия'];
  const makeDefaultPropertyRooms = () =>
    DEFAULT_ROOMS.map((name, idx) => ({
      id: `base-${idx + 1}`,
      name,
      base: true,
      items: [],
    }));
  const makeDefaultApartmentRooms = () =>
    DEFAULT_ROOMS.map((name, idx) => ({
      id: `base-app-${idx + 1}`,
      name,
      floor: '',
      walls: '',
      ceiling: '',
      doors: '',
      windows: '',
      condition: '',
    }));
    // Добавить недостающие базовые комнаты (не создавая дубликаты «Жилая комната», если уже есть «Жилая комната N»)
    const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const hasLivingRoomVariant = (rooms = []) => {
      return rooms.some(room => {
        const normalized = norm(room.name);
        if (!normalized) return false;
        const lettersOnly = normalized.replace(/[^a-zа-яё]/gi, '');
        return lettersOnly.startsWith('жилаякомната');
      });
    };
    const ensureBaseRooms = (propRooms, appRooms) => {
      const haveProp = new Set((propRooms || []).map(r => norm(r.name)));
      const haveApp  = new Set((appRooms  || []).map(r => norm(r.name)));

      const propHasLiving = hasLivingRoomVariant(propRooms);
      const appHasLiving  = hasLivingRoomVariant(appRooms);

      const addProp = DEFAULT_ROOMS
        .filter(name => {
          const n = norm(name);
          if (n === norm('Жилая комната')) return !propHasLiving;
          return !haveProp.has(n);
        })
        .map((name, i) => ({ id: `base-extra-${i}`, name, base: true, items: [] }));

      const addApp = DEFAULT_ROOMS
        .filter(name => {
          const n = norm(name);
          if (n === norm('Жилая комната')) return !appHasLiving;
          return !haveApp.has(n);
        })
        .map((name, i) => ({
          id: `base-app-extra-${i}`,
          name, floor: '', walls: '', ceiling: '', doors: '', windows: '', condition: ''
        }));

      return {
        nextProp: [...(propRooms || []), ...addProp],
        nextApp:  [...(appRooms  || []), ...addApp],
      };
    };



  // Состояния
  const [propertyData, setPropertyData] = useState([]);
  const [apartmentData, setApartmentData] = useState([]);
  const [showAddRoomModal, setShowAddRoomModal] = useState(false);
  const [newRoomType, setNewRoomType] = useState('');
  const [customRoomName, setCustomRoomName] = useState('');
  const [isMobile, setIsMobile] = useState(false);
  const [columnWidths, setColumnWidths] = useState({});
  // ---- Автодополнение: состояние ----
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestItems, setSuggestItems] = useState([]);
  const [suggestIndex, setSuggestIndex] = useState(0);
  const [suggestTarget, setSuggestTarget] = useState(null); // { roomId, itemId, roomName }
  // id предмета, в котором сейчас активное редактирование стоимости (чтобы убирать форматирование на фокусе)
  const [editingCostItemId, setEditingCostItemId] = useState(null);
  // === Синхронизация из пропсов (в том числе при повторном входе на шаг) ===
  useEffect(() => {
    if (Array.isArray(inventory)) {
      setPropertyData(inventory);
    }
  }, [inventory]);

  useEffect(() => {
    if (Array.isArray(apartmentDescription)) {
      setApartmentData(apartmentDescription);
    }
    // если ничего не пришло — дальше сработают наши «севдеры» базовых помещений ниже
  }, [apartmentDescription]);


  const tableRef = useRef(null);

  // Проверка мобильного устройства
  useEffect(() => {
    const checkDevice = () => {
      setIsMobile(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent));
    };
    
    checkDevice();
    window.addEventListener('resize', checkDevice);
    
    return () => {
      window.removeEventListener('resize', checkDevice);
    };
  }, []);
  
  // Инициализация данных при изменении количества комнат
  useEffect(() => {
    if (!roomCount || roomCount < 1) return;
    // Если данные уже пришли из родителя (вернулись из редактора/хранилища) — не перезатираем
    if (Array.isArray(inventory) && inventory.length) return;
    if (Array.isArray(apartmentDescription) && apartmentDescription.length) return;
    if ((propertyData && propertyData.length) || (apartmentData && apartmentData.length)) return;

    
    // Формируем данные для описи имущества
    const newPropertyRooms = [];
    for (let i = 0; i < roomCount; i++) {
      newPropertyRooms.push({ 
        id: `room-${i+1}`, 
        name: roomCount === 1 ? 'Жилая комната' : `Жилая комната ${i+1}`,
        base: true,
        items: [] 
      });
    }
    
    const basePropertyRooms = baseRoomTypes
      .filter(type => type !== 'Жилая комната')
      .map(type => ({
        id: type,
        name: type,
        base: true,
        items: []
      }));
    
    // Формируем данные для описания квартиры
    const newApartmentRooms = [];
    for (let i = 0; i < roomCount; i++) {
      newApartmentRooms.push({
        id: `room-${i+1}`,
        name: roomCount === 1 ? 'Жилая комната' : `Жилая комната ${i+1}`,
        floor: '',
        walls: '',
        ceiling: '',
        doors: '',
        windows: '',
        condition: ''
      });
    }
    
    const baseApartmentRooms = baseRoomTypes
      .filter(type => type !== 'Жилая комната')
      .map(type => ({
        id: type,
        name: type,
        floor: '',
        walls: '',
        ceiling: '',
        doors: '',
        windows: '',
        condition: ''
      }));
    
    // Обновляем состояния
    const updatedPropertyData = [...newPropertyRooms, ...basePropertyRooms];
    const updatedApartmentData = [...newApartmentRooms, ...baseApartmentRooms];
    
    setPropertyData(updatedPropertyData);
    setApartmentData(updatedApartmentData);
    setApartmentDescription?.(updatedApartmentData);
    setInventory(updatedPropertyData);
  }, [roomCount, setInventory, propertyData, apartmentData, inventory, apartmentDescription]);



  // Автоматический расчет ширины столбцов
  useEffect(() => {
    if (tableRef.current) {
      const table = tableRef.current;
      const widths = {};
      
      // Проходим по всем заголовкам таблицы
      const headerRow = table.querySelector('thead tr');
      if (headerRow) {
        const headers = headerRow.querySelectorAll('th');
        headers.forEach((header, index) => {
          // Определяем максимальную ширину содержимого
          let maxWidth = header.scrollWidth;
          
          // Проверяем содержимое ячеек в столбце
          const rows = table.querySelectorAll('tbody tr');
          rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells[index]) {
              const cellWidth = cells[index].scrollWidth;
              if (cellWidth > maxWidth) {
                maxWidth = cellWidth;
              }
            }
          });
          
          widths[index] = `${Math.min(maxWidth, 200)}px`;
        });
      }
      
      setColumnWidths(widths);
    }
  }, [propertyData, apartmentData]);
    // Всегда гарантируем наличие базовых помещений в UI
  useEffect(() => {
    const propEmpty = !Array.isArray(propertyData) || propertyData.length === 0;
    const appEmpty  = !Array.isArray(apartmentData) || apartmentData.length === 0;
    const externalPropFilled = Array.isArray(inventory) && inventory.length > 0;
    const externalAppFilled  = Array.isArray(apartmentDescription) && apartmentDescription.length > 0;

    // Если всё пусто (после очистки) — засеваем полный набор
    // Но пропускаем, если родитель уже передал сохранённые данные (например, после возврата к шагу мастера).
    if (propEmpty && appEmpty) {
      if (roomCount && roomCount > 0) {
        // Когда известно количество комнат, заполняет отдельный эффект выше.
        // Чтобы не плодить дубликаты "Жилых комнат", просто ждём его выполнения.
        return;
      }
      if (externalPropFilled || externalAppFilled) {
        return;
      }

      const defaultsProp = makeDefaultPropertyRooms();
      const defaultsApp  = makeDefaultApartmentRooms();
      setPropertyData(defaultsProp);
      setApartmentData(defaultsApp);
      setInventory(defaultsProp);
      return;
    }

    // Если какие-то базовые отсутствуют — досеять недостающее
    const { nextProp, nextApp } = ensureBaseRooms(propertyData, apartmentData);
    if (nextProp.length !== (propertyData || []).length) {
      setPropertyData(nextProp);
      setInventory(nextProp);
    }
    if (nextApp.length !== (apartmentData || []).length) {
      setApartmentData(nextApp);
    }
    }, [
      propertyData,
      apartmentData,
      inventory,
      apartmentDescription,
      setInventory,
      roomCount
    ]);

  // Добавление предмета в помещение
  const addItemToRoom = (roomId) => {
    const newData = propertyData.map(room => {
      if (room.id === roomId) {
        const newItem = {
          id: `item-${Date.now()}`,
          name: '',
          condition: 'Хорошее',
          estimatedCost: '',
          notes: ''
        };
        return { ...room, items: [...room.items, newItem] };
      }
      return room;
    });
    
    setPropertyData(newData);
    setInventory(newData);
  };

  // Удаление предмета из помещения
  const removeItemFromRoom = (roomId, itemId) => {
    const newData = propertyData.map(room => {
      if (room.id === roomId) {
        return {
          ...room,
          items: room.items.filter(item => item.id !== itemId)
        };
      }
      return room;
    });
    
    setPropertyData(newData);
    setInventory(newData);
  };

  // Обновление данных предмета
  const handleItemChange = (roomId, itemId, field, value) => {
    const newData = propertyData.map(room => {
      if (room.id === roomId) {
        return {
          ...room,
          items: room.items.map(item => 
            item.id === itemId ? { ...item, [field]: value } : item
          )
        };
      }
      return room;
    });
    
    setPropertyData(newData);
    setInventory(newData);
  };
  // Обработчик ввода имени + формирование подсказок
  const handleItemNameInput = (room, item, value) => {
    handleItemChange(room.id, item.id, 'name', value);

    // Подсказки только при активном поле и длине ≥ 2
    const items = buildSuggestions(value, room.name);
    setSuggestTarget({ roomId: room.id, itemId: item.id, roomName: room.name });
    setSuggestItems(items);
    setSuggestIndex(0);
    setSuggestOpen(items.length > 0);
  };

  // Применить выбранную подсказку
  const applySuggestion = (room, item, text) => {
    const val = text.endsWith(' ') ? text : (text + ' ');
    handleItemChange(room.id, item.id, 'name', val);

    // Положим в пользовательский словарь (чтобы всплывало в будущем)
    const user = getUserDict();
    if (!user.includes(text)) {
      user.unshift(text);
      saveUserDict(user.slice(0, 200));
    }

    setSuggestOpen(false);
  };

  // Добавление нового помещения
  const addNewRoom = () => {
    if (!newRoomType) return;
    
    let roomName = newRoomType;
    
    // Если выбрано "Другое", используем кастомное имя
    if (newRoomType === 'other') {
      if (!customRoomName.trim()) return;
      roomName = customRoomName.trim();
    } else {
      // Подсчет существующих комнат этого типа
      const count = propertyData.filter(room => 
        room.name.startsWith(newRoomType)
      ).length;
      
      roomName = count > 0 ? `${newRoomType} ${count + 1}` : newRoomType;
    }
    
    const newRoom = {
      id: `custom-${Date.now()}`,
      name: roomName,
      base: false,
      items: []
    };
    
    // Добавляем в опись имущества
    const newPropertyData = [...propertyData, newRoom];
    setPropertyData(newPropertyData);
    setInventory(newPropertyData);
    
    // Добавляем в описание квартиры
    const newApartmentRoom = {
      id: newRoom.id,
      name: roomName,
      floor: '',
      walls: '',
      ceiling: '',
      doors: '',
      windows: '',
      condition: ''
    };
    
    const nextApartment = [...apartmentData, newApartmentRoom];
    setApartmentData(nextApartment);                  // ← оставить
    setApartmentDescription?.(nextApartment);         // ← ДОБАВИТЬ СРАЗУ ПОСЛЕ предыдущей строки

    
    // Закрываем модальное окно и сбрасываем значения
    setShowAddRoomModal(false);
    setNewRoomType('');
    setCustomRoomName('');
  };

  // Удаление пользовательского помещения
  const removeRoom = (roomId) => {
    const room = propertyData.find(r => r.id === roomId);
    if (!room || room.base) return;
    
    // Удаляем из описи имущества
    const newPropertyData = propertyData.filter(room => room.id !== roomId);
    setPropertyData(newPropertyData);
    setInventory(newPropertyData);
    
    // Удаляем из описания квартиры
    const nextApartment = apartmentData.filter(room => room.id !== roomId);
    setApartmentData(nextApartment);                  // ← вместо prev => ...
    setApartmentDescription?.(nextApartment);         // ← ДОБАВИТЬ СРАЗУ ПОСЛЕ

  };

  // Обновление данных описания квартиры
  const handleApartmentChange = (roomId, field, value) => {
    const newData = apartmentData.map(room => 
      room.id === roomId ? { ...room, [field]: value } : room
    );
    setApartmentData(newData);
    setApartmentDescription?.(newData);
  };
  // ---- Хелперы для селектов с «Другое…» ----
  const selectValue = (val, options) => (val && options.includes(val)) ? val : (val ? 'other' : '');

  const renderSelectWithOther = (room, field, options, placeholder) => {
    const selectVal = selectValue(room[field], options);
    return (
      <div>
        <select
          value={selectVal}
          onChange={(e) => {
            const v = e.target.value;
            if (v === 'other') {
              // оставляем текущее произвольное значение; если его нет — ставим пустую строку
              handleApartmentChange(room.id, field, room[field] || '');
            } else {
              handleApartmentChange(room.id, field, v);
            }
          }}
          className="w-full h-10 px-2 border border-gray-300 rounded-md"
        >
          <option value="">{`Выберите из списка`}</option>
          {options.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
          <option value="other">Другое…</option>
        </select>

        {selectVal === 'other' && (
          <div className="mt-1">
            <AutoResizeTextarea
              value={room[field] || ''}
              onChange={(e) => handleApartmentChange(room.id, field, e.target.value)}
              placeholder={placeholder}
            />
          </div>
        )}
      </div>
    );
  };

  // Стили для таблиц
  const tableStyle = {
    width: '100%',
    tableLayout: isMobile ? 'fixed' : 'auto'
  };
  
  const cellStyle = {
    wordWrap: 'break-word',
    whiteSpace: 'pre-wrap',
    padding: '8px 4px',
    verticalAlign: 'top'
  };

  // ---- Автодополнение: хелперы ----


// Маппинг названия помещения -> ключ словаря
const roomKeyByName = (roomName) => {
  const n = norm(roomName);
  if (n.includes('гостиная') || n.includes('жила')) return 'livingRoom';
  if (n.includes('спаль')) return 'bedroom';
  if (n.includes('кух')) return 'kitchen';
  if (n.includes('корид') || n.includes('прихож')) return 'hallway';
  if (n.includes('сан') || n.includes('ванн') || n.includes('туал')) return 'bathroom';
  return 'global';
};

// Подтянуть пользовательский словарь из localStorage
const getUserDict = () => {
  try {
    const raw = localStorage.getItem('inventoryUserDict');
    const arr = JSON.parse(raw || '[]');
    if (Array.isArray(arr)) return arr;
  } catch {}
  return [];
};
const saveUserDict = (arr) => {
  try { localStorage.setItem('inventoryUserDict', JSON.stringify([...new Set(arr)])); } catch {}
};

// Построить список подсказок
const buildSuggestions = (query, roomName, max = 8) => {
  const q = norm(query);
  if (q.length < 2) return [];

  const roomKey = roomKeyByName(roomName);
  const base = [
    ...(inventoryDictionary.global || []),
    ...((inventoryDictionary[roomKey] || []))
  ];
  const user = getUserDict();
  const source = [...new Set([...user, ...base])];

  // Сначала — начинается с префикса, потом — просто содержит, короче — выше
  const starts = [];
  const contains = [];
  for (const s of source) {
    const ns = norm(s);
    if (ns.startsWith(q)) starts.push(s);
    else if (ns.includes(q)) contains.push(s);
  }
  const score = (s) => norm(s).length;
  starts.sort((a,b)=>score(a)-score(b));
  contains.sort((a,b)=>score(a)-score(b));

  return [...starts, ...contains].slice(0, max);
};

  return (
    <div className="space-y-8">
      {/* Модальное окно добавления комнаты */}
      {showAddRoomModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Добавить помещение</h3>
              <button 
                onClick={() => setShowAddRoomModal(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block mb-2 text-sm font-medium">
                  Выберите тип помещения
                </label>
                <select
                  value={newRoomType}
                  onChange={(e) => setNewRoomType(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-md"
                >
                  <option value="">Выберите из списка</option>
                  {baseRoomTypes.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                  <option value="other">Другое</option>
                </select>
              </div>
              
              {newRoomType === 'other' && (
                <div>
                  <label className="block mb-2 text-sm font-medium">
                    Введите название помещения
                  </label>
                  <input
                    type="text"
                    value={customRoomName}
                    onChange={(e) => setCustomRoomName(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-md"
                    placeholder="Название помещения"
                  />
                </div>
              )}
              
              <div className="flex justify-end space-x-2">
                <button
                  onClick={() => setShowAddRoomModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-md"
                >
                  Отмена
                </button>
                <button
                  onClick={addNewRoom}
                  className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
                >
                  Добавить
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Секция описи имущества */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">
          <FontAwesomeIcon icon={faClipboardList} className="mr-2 text-blue-600" />
          Опись имущества (Приложение №1)
        </h2>
        
        <div className={`overflow-x-auto ${isMobile ? 'bg-gray-50 p-2 rounded-lg' : ''}`}>
          {isMobile && (
            <p className="text-sm text-gray-500 mb-2 italic">
              На мобильных устройствах прокручивайте таблицу горизонтально
            </p>
          )}
          
          <table 
            ref={tableRef}
            className="w-full border-collapse border border-gray-200"
            style={tableStyle}
          >
            <thead className="bg-gray-50">
              <tr>
                <th style={{ ...cellStyle, minWidth: 80, textAlign: 'center' }}>
                  Действия
                </th>
                <th style={{ ...cellStyle, minWidth: 120 }}>
                  Наименование помещения
                </th>
                <th style={{ ...cellStyle, minWidth: 120 }}>
                  Наименование имущества
                </th>
                <th style={{ ...cellStyle, minWidth: 120 }}>
                  Состояние
                </th>
                <th style={{ ...cellStyle, minWidth: 120 }}>
                  Оценочная стоимость
                </th>
                <th style={{ ...cellStyle, minWidth: 120 }}>
                  Примечание
                </th>
              </tr>
            </thead>
            <tbody className="bg-white">
              {propertyData.map((room) => (
                <React.Fragment key={room.id}>
                  {/* Строка помещения */}
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <td style={{ ...cellStyle, textAlign: 'center' }}>
                      <div className="flex justify-center space-x-1">
                        <button
                          onClick={() => addItemToRoom(room.id)}
                          className="p-1 text-green-600 hover:text-green-800"
                          title="Добавить предмет"
                        >
                          <FontAwesomeIcon icon={faPlus} size="sm" />
                        </button>
                        {!room.base && (
                          <button
                            onClick={() => removeRoom(room.id)}
                            className="p-1 text-red-600 hover:text-red-800"
                            title="Удалить помещение"
                          >
                            <FontAwesomeIcon icon={faMinus} size="sm" />
                          </button>
                        )}
                      </div>
                    </td>
                    <td style={cellStyle}>
                      <div className="font-medium min-h-[40px] flex items-center">
                        {room.name}
                      </div>
                    </td>
                    <td colSpan={4} style={cellStyle}></td>
                  </tr>
                  
                  {/* Строки с предметами */}
                  {room.items.map((item) => (
                    <tr key={item.id} className="border-b border-gray-200 hover:bg-gray-50">
                      <td style={{ ...cellStyle, textAlign: 'center' }}>
			<button
    			  onClick={() => removeItemFromRoom(room.id, item.id)}
    			  className="p-1 text-red-600 hover:text-red-800"
    			  title="Удалить предмет"
  			>
    			  <FontAwesomeIcon icon={faTimes} size="sm" />
  			</button>
		      </td>
                      <td style={cellStyle}></td>
                      <td style={cellStyle}>
                        <div className="relative">
                          <AutoResizeTextarea
                            value={item.name}
                            onChange={(e) => handleItemNameInput(room, item, e.target.value)}
                            onFocus={() => {
                              // Показать подсказки для текущего значения при фокусе
                              const items = buildSuggestions(item.name, room.name);
                              setSuggestTarget({ roomId: room.id, itemId: item.id, roomName: room.name });
                              setSuggestItems(items);
                              setSuggestIndex(0);
                              setSuggestOpen(items.length > 0);
                            }}
                            onBlur={() => {
                              // Небольшая задержка, чтобы успел отработать клик по подсказке
                              setTimeout(()=> setSuggestOpen(false), 120);
                            }}
                            onKeyDown={(e) => {
                              if (!suggestOpen) return;
                              if (e.key === 'ArrowDown') { e.preventDefault(); setSuggestIndex(i => Math.min(i + 1, suggestItems.length - 1)); }
                              else if (e.key === 'ArrowUp') { e.preventDefault(); setSuggestIndex(i => Math.max(i - 1, 0)); }
                              else if (e.key === 'Enter' || e.key === 'Tab') {
                                e.preventDefault();
                                const s = suggestItems[suggestIndex] || suggestItems[0];
                                if (s) applySuggestion(room, item, s);
                              } else if (e.key === ' ') { // пробел также принимает верхнюю подсказку
                                e.preventDefault();
                                const s = suggestItems[suggestIndex] || suggestItems[0];
                                if (s) applySuggestion(room, item, s);
                              } else if (e.key === 'Escape') {
                                e.preventDefault();
                                setSuggestOpen(false);
                              }
                            }}
                            placeholder="Название предмета"
                          />

                          {suggestOpen && suggestTarget?.roomId === room.id && suggestTarget?.itemId === item.id && (
                            <ul className="absolute z-10 left-0 right-0 mt-1 max-h-48 overflow-auto bg-white border border-gray-300 rounded-md shadow">
                              {suggestItems.map((s, idx) => (
                                <li
                                  key={`${s}-${idx}`}
                                  className={`px-2 py-1 cursor-pointer ${idx === suggestIndex ? 'bg-blue-600 text-white' : 'hover:bg-gray-100'}`}
                                  onMouseDown={(e) => { e.preventDefault(); applySuggestion(room, item, s); }}
                                  onMouseEnter={() => setSuggestIndex(idx)}
                                >
                                  {s}
                                </li>
                              ))}
                              {suggestItems.length === 0 && (
                                <li className="px-2 py-1 text-gray-500">нет вариантов</li>
                              )}
                            </ul>
                          )}
                        </div>

                      </td>
                      <td style={cellStyle}>
                        <select
                          value={item.condition}
                          onChange={(e) => handleItemChange(room.id, item.id, 'condition', e.target.value)}
                          className="w-full p-1 border border-gray-300 rounded-md"
                        >
                          <option value="Отличное">Отличное</option>
                          <option value="Хорошее">Хорошее</option>
                          <option value="Удовлетворительное">Удовлетворительное</option>
                          <option value="Плохое">Плохое</option>
                          <option value="Требует ремонта">Требует ремонта</option>
                        </select>
                      </td>
                      <td style={cellStyle}>
                        <input
                          type="text"
                          className="w-full p-2 text-sm border border-gray-300 rounded-md"
                          // показываем «красивое» значение, но на фокусе — сырое (без " руб.")
                          value={
                            editingCostItemId === item.id
                              ? (item.estimatedCost ?? '')
                              : formatRubShort(item.estimatedCost)
                          }
                          onFocus={() => {
                            setEditingCostItemId(item.id);
                            // при входе в фокус снимаем форматирование: храним в item.estimatedCost чистое число/строку цифр
                            const num = parseRubShortToNumber(item.estimatedCost);
                            handleItemChange(room.id, item.id, 'estimatedCost', num ?? '');
                          }}
                          onChange={(e) => {
                            // позволяем вводить цифры/знаки разделителей — но в стейт кладём как число или пусто
                            const val = e.target.value;
                            const num = parseRubShortToNumber(val);
                            handleItemChange(room.id, item.id, 'estimatedCost', num ?? '');
                          }}
                          onBlur={() => {
                            // при потере фокуса нормализуем в число и выходим из режима редактирования
                            const num = parseRubShortToNumber(item.estimatedCost);
                            handleItemChange(room.id, item.id, 'estimatedCost', num ?? '');
                            setEditingCostItemId(null);
                          }}
                          placeholder="Стоимость"
                          inputMode="numeric"
                        />
                      </td>
                      <td style={cellStyle}>
                        <AutoResizeTextarea
                          value={item.notes}
                          onChange={(e) => handleItemChange(room.id, item.id, 'notes', e.target.value)}
                          placeholder="Описание, дефекты"
                        />
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
        
        <div className="mt-4">
          <button
            onClick={() => setShowAddRoomModal(true)}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 flex items-center"
          >
            <FontAwesomeIcon icon={faPlus} className="mr-2" />
            Добавить комнату
          </button>
        </div>
      </div>

      {/* Секция описания квартиры */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">
          <FontAwesomeIcon icon={faHome} className="mr-2 text-blue-600" />
          Описание квартиры (Приложение №2)
        </h2>
        
        <div className={`overflow-x-auto ${isMobile ? 'bg-gray-50 p-2 rounded-lg' : ''}`}>
          {isMobile && (
            <p className="text-sm text-gray-500 mb-2 italic">
              На мобильных устройствах прокручивайте таблицу горизонтально
            </p>
          )}
          
          <table 
            className="w-full border-collapse border border-gray-200"
            style={tableStyle}
          >
            <thead className="bg-gray-50">
              <tr>
                <th style={{ ...cellStyle, minWidth: 140 }}>
                  Наименование помещения
                </th>
                <th style={{ ...cellStyle, minWidth: 120 }}>
                  Пол
                </th>
                <th style={{ ...cellStyle, minWidth: 120 }}>
                  Стены
                </th>
                <th style={{ ...cellStyle, minWidth: 120 }}>
                  Потолок
                </th>
                <th style={{ ...cellStyle, minWidth: 120 }}>
                  Двери
                </th>
                <th style={{ ...cellStyle, minWidth: 120 }}>
                  Окна
                </th>
                <th style={{ ...cellStyle, minWidth: 120 }}>
                  Состояние
                </th>
              </tr>
            </thead>
            <tbody className="bg-white">
              {apartmentData.map((room) => (
                <tr key={room.id} className="border-b border-gray-200 hover:bg-gray-50">
                  <td style={cellStyle}>
                    <div className="font-medium min-h-[40px] flex items-center">
                      {room.name}
                    </div>
                  </td>
                  <td style={cellStyle}>
                   {renderSelectWithOther(room, 'floor', FLOOR_OPTIONS, 'Укажите покрытие пола')}
                  </td>
                  <td style={cellStyle}>
                   {renderSelectWithOther(room, 'walls', WALL_OPTIONS, 'Укажите отделку стен')}
                  </td>
                  <td style={cellStyle}>
                   {renderSelectWithOther(room, 'ceiling', CEILING_OPTIONS, 'Укажите тип потолка')}
                  </td>
                  <td style={cellStyle}>
                   {renderSelectWithOther(room, 'doors', DOOR_OPTIONS, 'Укажите тип дверей')}
                  </td>
                  <td style={cellStyle}>
                   {renderSelectWithOther(room, 'windows', WINDOW_OPTIONS, 'Укажите тип окон')}
                  </td>
                  <td style={cellStyle}>
                    <AutoResizeTextarea
                      value={room.condition}
                      onChange={(e) => handleApartmentChange(room.id, 'condition', e.target.value)}
                      placeholder="Общее состояние"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      
      <style>{`
        @media print {
          table {
            width: 100% !important;
            table-layout: fixed !important;
            max-width: 16cm !important;
          }
          th, td {
            word-wrap: break-word !important;
            white-space: normal !important;
            page-break-inside: avoid !important;
          }
          th {
            background-color: #f3f4f6 !important;
          }
        }
      `}</style>
    </div>
  );
};

export default InventorySection;