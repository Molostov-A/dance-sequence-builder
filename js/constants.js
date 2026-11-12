const STORAGE_KEY = 'dance-combos-v10';
const PANEL_STATE_KEY = 'dance-panels-v10';
const APP_NAME = 'dance_combos';
const SERVER_API_BASE = typeof window !== 'undefined' && typeof window.DANCE_API_BASE === 'string'
  ? window.DANCE_API_BASE.replace(/\/$/, '') : '';
/* Версия файлов приложения. Должна совпадать с <meta name="app-version"> и
   с ?v=… у всех css/js в index.html (проверяет tests/run-tests.js). Меняется
   при каждой правке js/css: иначе браузер (GitHub Pages кэширует на 10 минут)
   может взять новую страницу со старыми скриптами. */
const APP_VERSION = '2026-11-13.1';

// Владелец приложения настраивает один раз перед публикацией. Это публичные
// браузерные реквизиты, не client secret. Пользователям вводить их не нужно.
const GOOGLE_DRIVE_CONFIG = Object.freeze({
  clientId: '',
  apiKey: '',
  projectNumber: ''
});

/* Метрики */
const CARD_W = 200;
const CARD_H = 82;
const MINI_H = 28;
const MINI_W = 180;
const MINI_GAP = 6;
const H_GAP = 70;            // между крупными карточками хребта
const H_GAP_MINI = 30;       // между крупной карточкой и стеком миников
const CHILD_H_GAP = 60;      // отступ продолжений от активного
const BUS_OFFSET = 30;
const PAD = 30;
const STACK_OFFSET = 30;     // насколько стек сдвинут правее карточки родителя (для линии пути)

/* Блок препа на линии. Высота фиксированная (название в одну строку с
   многоточием), поэтому в двухпроходной раскладке его не нужно замерять. */
const PREP_W = 120;
const PREP_H = 24;
const PREP_GAP = 24;         // зазор слева и справа от блока препа
const PREP_COL = PREP_W + PREP_GAP * 2; // на столько раздвигается колонка детей, если у кого-то из них есть преп
// Свёрнутый преп — круглая метка на линии; ей нужен лишь узкий промежуток
const PREP_MARK = 18;
const PREP_MARK_GAP = 10;
const PREP_MARK_COL = PREP_MARK + PREP_MARK_GAP * 2;
