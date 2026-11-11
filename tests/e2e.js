// Pruebas de punta a punta: menú -> panel de cocina.
//   MODO=sheets (por defecto): el sitio habla por HTTP con backend/Code.gs ejecutado en el emulador.
//   MODO=demo: sin servidor (datos en el navegador).
// Uso: ./build.sh && node tests/e2e.js   |   MODO=demo node tests/e2e.js
const { chromium, devices } = require('playwright');
const http = require('http'), path = require('path'), fs = require('fs');
const { servidor } = require('./gas-emulador');
const MODO = process.env.MODO || 'sheets';
const USUARIO = MODO === 'sheets' ? 'usuario-prueba' : 'demo';
const DIST = path.join(__dirname, '..', 'docs');
const OUT = process.env.SHOTS || path.join(__dirname, 'capturas');
fs.mkdirSync(OUT, { recursive: true });
const res = []; const ok = (n, c, d = '') => res.push([c ? 'PASA' : 'FALLA', n, String(d)]);
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.png': 'image/png', '.txt': 'text/plain' };

(async () => {
  let api = null;
  if (MODO === 'sheets') api = await servidor({ puerto: 8790, usuario: 'usuario-prueba' });
  // Sitio estático (dist/) en otro origen, con fm-config.js apuntando al emulador
  const web = http.createServer((req, r) => {
    let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
    if (p === '/assets/fm-config.js') {
      r.writeHead(200, { 'Content-Type': 'text/javascript' });
      return r.end(`window.FM_CONFIG={APPS_SCRIPT_URL:${JSON.stringify(api ? api.url : '')},INTERVALO_SEGUNDOS:1,DEMO_USUARIO:"demo"};`);
    }
    const f = path.join(DIST, p);
    if (!f.startsWith(DIST) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'Content-Type': TIPOS[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
  });
  await new Promise(r => web.listen(8765, '127.0.0.1', r));
  const B = 'http://127.0.0.1:8765';
  const control = q => new Promise(r => http.get(`http://127.0.0.1:8790/control${q || ''}`, x => { let b = ''; x.on('data', c => b += c); x.on('end', () => r(JSON.parse(b))); }));

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, acceptDownloads: true });
  const errores = [];
  const panel = await ctx.newPage(); panel.on('pageerror', e => errores.push(e.message));
  const setFallar = async v => MODO === 'sheets' ? control(`?fallar=${v ? 1 : 0}`) : panel.evaluate(x => x ? localStorage.setItem('fm.demo.fallar', '1') : localStorage.removeItem('fm.demo.fallar'), v);
  const total = async () => MODO === 'sheets' ? (await control()).total : panel.evaluate(() => JSON.parse(localStorage.getItem('fm.demo.v1')).pedidos.length);
  const cuenta = async est => Number(await panel.textContent(`.tab[data-vista="${est}"] .n`));
  const guardado = () => panel.waitForFunction(() => document.body.dataset.guardando === '0');

  // ---- El usuario no está en el código público ----
  const publico = ['index.html', 'cocina/index.html', 'assets/fm-config.js', 'assets/fm-backend.js'].map(f => fs.readFileSync(path.join(DIST, f), 'utf8')).join('');
  ok('el usuario de prueba NO aparece en el sitio público', !/usuario-prueba/i.test(publico));

  // ---- Acceso ----
  await panel.goto(B + '/cocina/');
  ok('sin sesión muestra la entrada y no pedidos', await panel.isVisible('#v-login') && !(await panel.isVisible('#v-app')));
  ok('sin contraseña ni código: sólo campo Usuario', (await panel.$$('#f-login input')).length === 1 && (await panel.$$('input[type=password]')).length === 0);
  await panel.fill('#l-usuario', 'cocina'); await panel.click('#l-btn');
  await panel.waitForSelector('#l-err:not(:empty)');
  ok('usuario incorrecto rechazado', /incorrecto/.test(await panel.textContent('#l-err')), await panel.textContent('#l-err'));
  await panel.fill('#l-usuario', USUARIO); await panel.click('#l-btn');
  await panel.waitForSelector('#v-app:not([hidden])');
  await panel.waitForFunction(() => !document.querySelector('.cargando'));
  const n0 = await cuenta('Nuevo');
  ok('usuario correcto entra al panel', true, `nuevos=${n0}`);

  // ---- Pedido desde el menú (otra pestaña) ----
  const form = await ctx.newPage(); form.on('pageerror', e => errores.push(e.message));
  async function pedir({ nombre, empresa, platillo, guisado, guarn, bebida, postre }) {
    await form.goto(B + '/'); await form.evaluate(() => localStorage.removeItem('fiestamarket.cliente')); await form.goto(B + '/');
    await form.fill('#nombre', nombre); await form.click(`input[name=empresa][value="${empresa}"]`); await form.click('#btn-next');
    await form.click(`input[name=platillo][value="${platillo}"]`); await form.waitForSelector('section[data-step="3"]:not([hidden])');
    if (guisado) { await form.click(`input[name=guisado][value="${guisado}"]`); for (const g of guarn) await form.click(`input[name=guarniciones_comida][value="${g}"]`); }
    else await form.click(`input[name=guarnicion_combo][value="${guarn[0]}"]`);
    await form.click('#btn-next'); await form.click(`input[name=bebida][value="${bebida}"]`); await form.click(`input[name=postre][value="${postre}"]`);
    await form.click('#btn-next'); await form.click('#btn-next');
  }
  await pedir({ nombre: 'Rosa Prueba', empresa: 'NISSAN', platillo: 'Comida del día', guisado: 'Guisado de pollo', guarn: ['Arroz blanco', 'Frijoles negros', 'Tortillas'], bebida: 'Agua de tamarindo', postre: 'Pastel del día' });
  await form.click('#btn-next'); await form.waitForSelector('section[data-step="7"]:not([hidden])');
  const folio1 = await form.textContent('#folio');
  ok('menú confirma con el folio del servidor', /^FM-\d{6}-\d{4}$/.test(folio1), folio1);
  ok(MODO === 'sheets' ? 'sin aviso de modo demostración' : 'muestra aviso de modo demostración', (await form.isVisible('#testmode')) === (MODO === 'demo'));

  // ---- Recepción automática en el panel ----
  await panel.waitForSelector('.ped.vivo', { timeout: 8000 }).catch(() => {});
  const vivo = await panel.$eval('.ped.vivo .cliente', e => e.textContent).catch(() => '');
  ok('panel recibe el pedido sin recargar', vivo === 'Rosa Prueba', vivo);
  ok('contador de Nuevo sube', await cuenta('Nuevo') === n0 + 1, String(await cuenta('Nuevo')));
  ok('pedido nuevo resaltado', await panel.$eval('.ped.vivo', e => e.classList.contains('s-nuevo') && !!e.querySelector('.badge-nuevo')).catch(() => false));
  ok('aviso de pedido nuevo', /Rosa Prueba/.test(await panel.textContent('#toasts')));
  ok('tarjeta con guarniciones y bebida', await panel.locator('.ped', { hasText: 'Rosa Prueba' }).evaluate(e => /Frijoles negros/.test(e.textContent) && /Agua de tamarindo/.test(e.textContent)));
  await panel.screenshot({ path: path.join(OUT, `panel-${MODO}.png`) });

  await pedir({ nombre: 'Pepe Ford', empresa: 'FORD', platillo: 'Tacos de carne', guarn: ['Plátano asado'], bebida: 'Squirt', postre: 'Pan del día' });
  await form.click('#btn-next'); await form.waitForSelector('section[data-step="7"]:not([hidden])');
  await panel.waitForFunction(() => [...document.querySelectorAll('.cliente')].some(e => e.textContent === 'Pepe Ford'), null, { timeout: 8000 });
  ok('segundo pedido (FORD) llega', true);

  // ---- Filtros ----
  await panel.click('[data-emp="FORD"]');
  const e1 = await panel.$$eval('#lista .emp', a => [...new Set(a.map(e => e.textContent))]);
  ok('filtro FORD', e1.length === 1 && e1[0] === 'FORD', e1.join(','));
  await panel.click('[data-emp="NISSAN"]');
  const e2 = await panel.$$eval('#lista .emp', a => [...new Set(a.map(e => e.textContent))]);
  ok('filtro NISSAN', e2.length === 1 && e2[0] === 'NISSAN', e2.join(','));
  await panel.click('[data-emp="Todos"]');
  ok('filtro Todos', (await panel.$$eval('#lista .emp', a => new Set(a.map(e => e.textContent)).size)) === 2);

  // ---- Estados ----
  const card = () => panel.locator('.ped', { hasText: 'Rosa Prueba' });
  const p0 = await cuenta('En preparación');
  await card().locator('.act').click(); await guardado();
  ok('Nuevo → En preparación', (await card().locator('.pill').textContent()) === 'En preparación' && await cuenta('En preparación') === p0 + 1);
  await card().locator('.act').click(); await guardado();
  ok('En preparación → Listo', (await card().locator('.pill').textContent()) === 'Listo');
  await card().locator('.undo').click(); await guardado();
  ok('Regresar a En preparación', (await card().locator('.pill').textContent()) === 'En preparación');
  await card().locator('.act').click(); await guardado(); await card().locator('.act').click(); await guardado();
  ok('Listo → Entregado sale de Activos', await card().count() === 0);
  await panel.waitForTimeout(1500);   // que el sondeo no reponga estados viejos
  await panel.click('.tab[data-vista="Entregado"]');
  ok('aparece en Entregado', await card().count() === 1);
  await panel.reload(); await panel.waitForSelector('#v-app:not([hidden]) .ped');
  await panel.click('.tab[data-vista="Entregado"]');
  ok('estado guardado (persiste al recargar)', await card().count() === 1);
  await panel.click('.tab[data-vista="Activos"]');

  // ---- Nota ----
  const pepe = () => panel.locator('.ped', { hasText: 'Pepe Ford' });
  await pepe().locator('.nota-btn').click(); await pepe().locator('.nota').fill('Sin tortilla extra'); await panel.click('h3.cliente >> nth=0');
  await panel.waitForSelector('.toast:has-text("Nota guardada")'); await panel.reload(); await panel.waitForSelector('.ped');
  ok('nota de cocina se guarda', (await pepe().locator('.nota').inputValue()) === 'Sin tortilla extra');

  // ---- Fallas de conexión ----
  await setFallar(true);
  await pepe().locator('.act').click();
  await panel.waitForSelector('.toast.error', { timeout: 25000 });
  ok('si falla el cambio, se revierte y avisa', (await pepe().locator('.pill').textContent()) === 'Nuevo');
  await panel.waitForFunction(() => document.querySelector('#conn').dataset.s !== 'conectado', null, { timeout: 8000 }).catch(() => {});
  ok('indicador muestra problema de conexión', (await panel.getAttribute('#conn', 'data-s')) !== 'conectado', await panel.getAttribute('#conn', 'data-s'));
  await setFallar(false);
  await panel.waitForFunction(() => document.querySelector('#conn').dataset.s === 'conectado', null, { timeout: 8000 }).catch(() => {});
  ok('se reconecta solo', (await panel.getAttribute('#conn', 'data-s')) === 'conectado');

  const t0 = await total();
  await pedir({ nombre: 'Reintento', empresa: 'FORD', platillo: 'Burrito de carne', guarn: ['Papas fritas'], bebida: 'Fanta', postre: 'Pan del día' });
  await setFallar(true);
  await form.click('#btn-next'); await form.waitForSelector('#err-envio:not(:empty)', { timeout: 25000 });
  ok('sin conexión: el menú NO confirma', !(await form.isVisible('section[data-step="7"]')) && /NO está confirmado/.test(await form.textContent('#err-envio')));
  await setFallar(false);
  await form.click('#btn-next'); await form.click('#btn-next').catch(() => {});
  await form.waitForSelector('section[data-step="7"]:not([hidden])');
  ok('reintento + doble toque = un solo pedido', await total() === t0 + 1, `${t0} → ${await total()}`);

  // ---- Exportar ----
  await panel.click('#b-exportar');
  const [dl] = await Promise.all([panel.waitForEvent('download'), panel.click('#e-csv')]);
  const csv = fs.readFileSync(await dl.path(), 'utf8'), lineas = csv.trim().split(/\r\n/);
  ok('CSV con encabezados y todos los pedidos', csv.charCodeAt(0) === 0xFEFF && lineas[0].startsWith('Folio,Fecha,Hora,Nombre,Empresa') && lineas.length - 1 === await total(), `${lineas.length - 1} filas`);
  await panel.click('#e-cerrar');

  // ---- Salir ----
  await panel.click('#b-salir');
  ok('al salir no quedan pedidos en pantalla', await panel.isVisible('#v-login') && (await panel.$$eval('.ped', a => a.length)) === 0);
  await panel.reload(); await panel.waitForSelector('#v-login:not([hidden])');
  ok('tras salir, recargar pide el usuario', await panel.isVisible('#v-login'));

  // ---- La sesión se recuerda en la tablet ----
  if (MODO === 'sheets') {
    await panel.fill('#l-usuario', USUARIO); await panel.click('#l-btn'); await panel.waitForSelector('#v-app:not([hidden])');
    const p2 = await ctx.newPage(); await p2.goto(B + '/cocina/'); await p2.waitForSelector('#v-app:not([hidden])');
    ok('la tablet recuerda la sesión (no vuelve a pedir usuario)', true); await p2.close();
  }

  // ---- Celular y tablet ----
  for (const [nombre, dev] of [['celular', devices['iPhone 13']], ['tablet', devices['iPad (gen 7)']]]) {
    const c = await browser.newContext({ ...dev }); const p = await c.newPage(); p.on('pageerror', e => errores.push(e.message));
    await p.goto(B + '/cocina/'); await p.fill('#l-usuario', USUARIO); await p.click('#l-btn'); await p.waitForSelector('.ped');
    const of = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    const alto = await p.$eval('.act', e => e.getBoundingClientRect().height);
    ok(`${nombre}: sin desbordes y botones grandes`, !of && alto >= 56, `botón ${Math.round(alto)}px`);
    await p.screenshot({ path: path.join(OUT, `panel-${nombre}-${MODO}.png`) }); await c.close();
  }
  ok('sin errores de JavaScript', errores.length === 0, errores.join(' | ').slice(0, 140));

  await browser.close(); web.close(); if (api) api.srv.close();
  const w = Math.max(...res.map(r => r[1].length));
  console.log(`== MODO ${MODO} ==`);
  res.forEach(r => console.log(`${r[0].padEnd(6)} ${r[1].padEnd(w)}  ${r[2]}`));
  const pasa = res.filter(r => r[0] === 'PASA').length;
  console.log(`\n${pasa} de ${res.length} pruebas pasaron`);
  process.exit(pasa === res.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
