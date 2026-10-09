const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const storage = new Map();
const handlers = {};
const classList = { add() {}, remove() {}, toggle() {} };
const element = () => ({
  classList, style: {}, dataset: {}, textContent: '', innerHTML: '', value: '',
  addEventListener() {}, focus() {}, setAttribute() {}, setSelectionRange() {},
  appendChild() {}, remove() {}, click() {}
});
const els = {
  'app-content': element(), 'breadcrumb-current': element(), sidebar: element(),
  toast: element(), 'menu-toggle': element(), 'environment-title': element(),
  'environment-detail': element(), 'environment-indicator': element(),
  'user-mode-avatar': element(), 'environment-status-dot': element()
};
const document = {
  getElementById: id => els[id] || (els[id] = element()),
  querySelectorAll: () => [], querySelector: () => null,
  addEventListener: (name, fn) => { handlers[name] = fn; },
  createElement: element, body: element()
};
const window = {
  RMEIntegrationConfig: { enabled: true },
  localStorage: {
    getItem: key => storage.has(key) ? storage.get(key) : null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key)
  },
  crypto: { randomUUID: () => 'never-use-demo' }, scrollTo() {}
};
const ctx = {
  window, document, Date, Math, JSON, Set, Map, Array, String, Number, Object,
  RegExp, Error, Intl, URLSearchParams, location: { search: '', pathname: '/index.html', href: 'http://localhost/index.html' },
  history: { replaceState() {} }, setTimeout, clearTimeout, console,
  FormData: class { constructor(form) { this.form = form; } get(k) { return this.form.values?.[k] ?? null; } }
};
vm.createContext(ctx);
// Intentionally omit js/data-service.js to simulate a missing production adapter script.
for (const file of ['js/data.js', 'js/anthropometry.js', 'js/growth-reference-data.js', 'js/growth-engine.js', 'js/growth-chart.js', 'js/repository.js', 'js/app.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), ctx, { filename: file });
}
setTimeout(() => {
  try {
    assert.strictEqual(storage.size, 0, 'production config must not initialize/write demo localStorage');
    assert(els['app-content'].innerHTML.includes('Layanan integrasi RME tidak termuat'));
    assert(!els['app-content'].innerHTML.includes('MODE DEMO'));
    console.log('PASS production configuration fails closed if API adapter script is missing; demo storage remains untouched');
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}, 20);
