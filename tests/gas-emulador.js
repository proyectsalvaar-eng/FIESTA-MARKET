// Emulador mínimo de Google Apps Script para probar backend/Code.gs sin Google.
// Ejecuta el MISMO archivo Code.gs con versiones simuladas de SpreadsheetApp,
// PropertiesService, LockService, ContentService y Utilities.
const fs = require('fs'), path = require('path'), vm = require('vm'), http = require('http'), crypto = require('crypto');

function crearContexto(usuario) {
  const props = new Map();
  const chain = () => new Proxy({}, { get: () => () => chain() });   // métodos de formato: no-ops encadenables
  function hoja(nombre) {
    const filas = [];
    return {
      nombre, filas,
      getLastRow: () => filas.length,
      appendRow: f => { filas.push(f.slice()); },
      getRange(r, c, nr, nc) {
        if (typeof r === 'string') return chain();
        nr = nr || 1; nc = nc || 1;
        const rango = {
          getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => {
            const v = (filas[r - 1 + i] || [])[c - 1 + j]; return v === undefined || v === null ? '' : v; })),
          setValues(vals) { vals.forEach((f, i) => { filas[r - 1 + i] = filas[r - 1 + i] || []; f.forEach((v, j) => filas[r - 1 + i][c - 1 + j] = v); }); return rango; },
          setFontWeight: () => rango, setFontColor: () => rango, setBackground: () => rango, setNumberFormat: () => rango
        };
        return rango;
      },
      setFrozenRows() {}, hideColumns() {}, protect: () => chain()
    };
  }
  const hojas = {};
  const ss = { getSheetByName: n => hojas[n] || null, insertSheet: n => (hojas[n] = hoja(n)), setSpreadsheetTimeZone() {} };
  const ctx = {
    console,
    SpreadsheetApp: { getActiveSpreadsheet: () => ss },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: k => props.has(k) ? props.get(k) : null, setProperty: (k, v) => props.set(k, String(v)), deleteProperty: k => props.delete(k) }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock() {}, releaseLock() {} }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: s => ({ setMimeType() { return this; }, getContent: () => s }) },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      formatDate(d, tz, fmt) {
        const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: '2-digit', month: '2-digit', day: '2-digit' })
          .formatToParts(d).map(x => [x.type, x.value]));
        return fmt.replace('yy', p.year).replace('MM', p.month).replace('dd', p.day);
      }
    }
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'backend', 'Code.gs'), 'utf8'), ctx, { filename: 'Code.gs' });
  props.set('USUARIO_COCINA', usuario);
  vm.runInContext('configurar()', ctx);
  const post = body => JSON.parse(ctx.doPost({ postData: { contents: typeof body === 'string' ? body : JSON.stringify(body) } }).getContent());
  return { ctx, props, hojas, post };
}

// Servidor HTTP que se comporta como la URL /exec (CORS como Apps Script: sin preflight)
function servidor({ puerto, usuario }) {
  const g = crearContexto(usuario);
  let fallar = false;
  const srv = http.createServer((req, res) => {
    if (req.url.startsWith('/control')) {
      const u = new URL(req.url, 'http://x');
      if (u.searchParams.has('fallar')) fallar = u.searchParams.get('fallar') === '1';
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ total: g.hojas.Pedidos.filas.length - 1, filas: g.hojas.Pedidos.filas }));
    }
    if (req.method === 'OPTIONS') { res.writeHead(405); return res.end(); }  // Apps Script no responde preflight
    if (fallar) return req.socket.destroy();                                  // simula caída de red
    let body = ''; req.on('data', c => body += c);
    req.on('end', () => {
      const out = req.method === 'POST' ? g.post(body) : JSON.parse(g.ctx.doGet().getContent());
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(out));
    });
  });
  return new Promise(r => srv.listen(puerto, '127.0.0.1', () => r({ srv, g, url: `http://127.0.0.1:${puerto}/exec` })));
}

module.exports = { crearContexto, servidor };
