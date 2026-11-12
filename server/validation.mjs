import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Сервер использует те же миграции и правила счёта, что и SPA. Выполняется
// только код проекта: пользовательский JSON передаётся как значение, не как JS.
const context = vm.createContext({ localStorage: { getItem: () => null }, console });
for (const file of ['constants.js', 'state.js', 'beat.js']) {
  vm.runInContext(readFileSync(path.join(root, 'js', file), 'utf8'), context, { filename: file });
}
const validate = new vm.Script(`(() => {
  const data = prepareState(inputData);
  Object.values(data.nodes).forEach(n => {
    const parent = n.parentId === null ? null : data.nodes[n.parentId];
    if (!allowedLengths(n.beat).includes(n.length) || (parent && n.beat !== parent.beat + parent.length)) {
      throw new Error('Недопустимые счёты узла ' + n.id);
    }
  });
  delete data.activePath; delete data.currentView; delete data.navPinned;
  return JSON.stringify(data);
})()`);

export function validateDocument(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)
    || !data.nodes || Object.keys(data.nodes).length > 4000
    || !Array.isArray(data.movements) || data.movements.length > 4000) throw new Error('Некорректный размер или структура библиотеки.');
  context.inputData = structuredClone(data);
  try { return validate.runInContext(context, { timeout: 1000 }); }
  finally { delete context.inputData; }
}
