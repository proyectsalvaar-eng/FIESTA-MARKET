/**
 * FIESTA MARKET — Servidor de pedidos (Google Apps Script + Google Sheets)
 *
 * Instalación: ver PUESTA-EN-MARCHA.md
 * Se puede crear desde la hoja (Extensiones > Apps Script) o directo en script.google.com.
 * 1. Escribe abajo el usuario de cocina en USUARIO_INICIAL (sólo aquí, NO en GitHub).
 * 2. Ejecuta `configurar` una vez.
 * 3. Implementar > Aplicación web (Ejecutar como: Yo · Acceso: Cualquier persona).
 *
 * Seguridad:
 *  - Los clientes sólo pueden CREAR pedidos (validados aquí, en el servidor).
 *  - Ver y cambiar pedidos requiere haber entrado con el usuario de cocina.
 *  - El usuario se guarda en las Propiedades del script, no en el sitio web.
 */

const USUARIO_INICIAL = 'ESCRIBE_AQUI_EL_USUARIO';   // <- cámbialo antes de ejecutar configurar
const ZONA = 'America/Mexico_City';
const HOJA = 'Pedidos';
const COLS = ['Folio', 'Fecha y hora', 'Nombre', 'Empresa', 'Platillo', 'Guisado', 'Guarniciones', 'Bebida',
  'Postre', 'Comentarios', 'Estado', 'Cambio de estado', 'Notas de cocina', 'Actualizado (ms)', 'Llave'];
const C = {}; COLS.forEach((n, i) => C[n] = i);
const ESTADOS = ['Nuevo', 'En preparación', 'Listo', 'Entregado'];
const SESION_DIAS = 30;

// Opciones válidas (deben coincidir con CONFIG de index.html)
const EMPRESAS = ['NISSAN', 'FORD'];
const MENU = {
  platillos: { 'Comida del día': 'comida', 'Burrito de carne': 'combo', 'Tacos de carne': 'combo', 'Quesadilla de carne': 'combo' },
  guisados: ['Guisado de pollo', 'Guisado de cerdo', 'Guisado de res'],
  guarnicionesComida: ['Arroz blanco', 'Arroz amarillo', 'Frijoles charros', 'Frijoles molidos', 'Frijoles negros', 'Plátano asado', 'Papas fritas', 'Tortillas'],
  guarnicionesCombo: ['Papas fritas', 'Plátano asado'],
  bebidas: ['Agua de jamaica', 'Agua de tamarindo', 'Agua de horchata', 'Fanta', 'Coca-Cola', 'Sprite', 'Squirt'],
  postres: ['Pan del día', 'Gelatina del día', 'Pastel del día']
};

/* ===================== Instalación ===================== */
function configurar() {
  const props = PropertiesService.getScriptProperties();
  if (USUARIO_INICIAL && USUARIO_INICIAL !== 'ESCRIBE_AQUI_EL_USUARIO') props.setProperty('USUARIO_COCINA', USUARIO_INICIAL.trim().toLowerCase());
  if (!props.getProperty('USUARIO_COCINA')) throw new Error('Escribe el usuario de cocina en USUARIO_INICIAL y vuelve a ejecutar configurar.');
  if (!props.getProperty('SEQ')) props.setProperty('SEQ', '0');
  if (!props.getProperty('VERSION')) props.setProperty('VERSION', '1');
  const ss = libro();
  ss.setSpreadsheetTimeZone(ZONA);
  const h = ss.getSheetByName(HOJA) || ss.insertSheet(HOJA, 0);
  h.getRange(1, 1, 1, COLS.length).setValues([COLS]).setFontWeight('bold').setFontColor('#FFFFFF').setBackground('#990F2D');
  h.setFrozenRows(1);
  h.getRange('B:B').setNumberFormat('dd/mm/yyyy hh:mm');
  h.getRange('L:L').setNumberFormat('dd/mm/yyyy hh:mm');
  h.hideColumns(C['Actualizado (ms)'] + 1, 2);   // columnas técnicas
  h.protect().setDescription('Pedidos: se administran desde el panel /cocina').setWarningOnly(true);
}

/** Cambiar el usuario después: edita el valor y ejecuta esta función. Cierra todas las sesiones abiertas. */
function cambiarUsuario() {
  const props = PropertiesService.getScriptProperties();
  props.setProperty('USUARIO_COCINA', USUARIO_INICIAL.trim().toLowerCase());
  props.deleteProperty('SESIONES');
}

/* ===================== Entrada HTTP ===================== */
function doGet() { return json({ ok: true, servicio: 'FIESTA MARKET pedidos' }); }

function doPost(e) {
  let req;
  try { req = JSON.parse(e.postData.contents); } catch (err) { return json(falla('Solicitud inválida', 'validacion')); }
  try {
    switch (req.accion) {
      case 'crear': return json(conBloqueo(() => crear(req.pedido || {})));
      case 'entrar': return json(conBloqueo(() => entrar(req.usuario)));
      case 'sesion': validarSesion(req.token); return json({ ok: true, nombre: 'Cocina' });
      case 'salir': return json(conBloqueo(() => salir(req.token)));
      case 'empresas': return json({ ok: true, empresas: EMPRESAS });
      case 'listar': validarSesion(req.token); return json(listar(req.desde, req.hasta));
      case 'cambios': validarSesion(req.token); return json(cambios(req.version, req.desde));
      case 'actualizar': validarSesion(req.token); return json(conBloqueo(() => actualizar(req.id, req.cambios || {})));
      default: return json(falla('Acción desconocida', 'validacion'));
    }
  } catch (err) {
    if (err && err.fm) return json(err.fm);
    return json(falla('Error del servidor. Inténtalo de nuevo.', 'error'));
  }
}

/* ===================== Pedidos ===================== */
function crear(p) {
  const key = String(p.idempotency_key || '');
  if (!/^[0-9a-f-]{36}$/i.test(key)) throw fm('Solicitud inválida', 'validacion');
  const filas = leer();
  const previa = filas.find(f => f[C['Llave']] === key);
  if (previa) return { ok: true, folio: previa[C['Folio']], duplicado: true };

  const t = v => String(v == null ? '' : v).trim();
  const nombre = t(p.nombre), empresa = t(p.empresa), platillo = t(p.platillo), bebida = t(p.bebida), postre = t(p.postre);
  let guisado = t(p.guisado); const coment = t(p.comentarios);
  if (nombre.length < 1 || nombre.length > 60) throw fm('Escribe tu nombre (máx. 60 letras)', 'validacion');
  if (EMPRESAS.indexOf(empresa) < 0) throw fm('Empresa no válida', 'validacion');
  const ruta = MENU.platillos[platillo];
  if (!ruta) throw fm('Platillo no disponible', 'validacion');
  if (!Array.isArray(p.guarniciones)) throw fm('Guarniciones no válidas', 'validacion');
  const guarn = Array.from(new Set(p.guarniciones.map(t))).sort();
  if (ruta === 'comida') {
    if (MENU.guisados.indexOf(guisado) < 0) throw fm('Elige un guisado válido', 'validacion');
    if (guarn.length !== 3 || guarn.some(g => MENU.guarnicionesComida.indexOf(g) < 0)) throw fm('Elige exactamente 3 guarniciones', 'validacion');
  } else {
    guisado = '';
    if (guarn.length !== 1 || MENU.guarnicionesCombo.indexOf(guarn[0]) < 0) throw fm('Elige una guarnición válida', 'validacion');
  }
  if (MENU.bebidas.indexOf(bebida) < 0) throw fm('Bebida no disponible', 'validacion');
  if (MENU.postres.indexOf(postre) < 0) throw fm('Postre no disponible', 'validacion');
  if (coment.length > 400) throw fm('Comentario demasiado largo', 'validacion');

  // Doble envío accidental: mismo pedido en los últimos 2 minutos -> mismo folio
  const ahora = new Date(), guarnTxt = guarn.join(', ');
  const igual = filas.slice(-50).reverse().find(f =>
    String(f[C['Nombre']]).toLowerCase() === nombre.toLowerCase() && f[C['Empresa']] === empresa && f[C['Platillo']] === platillo &&
    f[C['Guisado']] === guisado && f[C['Guarniciones']] === guarnTxt && f[C['Bebida']] === bebida && f[C['Postre']] === postre &&
    f[C['Comentarios']] === coment && ahora - new Date(f[C['Fecha y hora']]) < 120000);
  if (igual) return { ok: true, folio: igual[C['Folio']], duplicado: true };

  const props = PropertiesService.getScriptProperties();
  const seq = Number(props.getProperty('SEQ') || 0) + 1;
  props.setProperty('SEQ', String(seq));
  const folio = 'FM-' + Utilities.formatDate(ahora, ZONA, 'yyMMdd') + '-' + ('000' + seq).slice(-4);
  const fila = new Array(COLS.length).fill('');
  fila[C['Folio']] = folio; fila[C['Fecha y hora']] = ahora; fila[C['Nombre']] = seguro(nombre); fila[C['Empresa']] = empresa;
  fila[C['Platillo']] = platillo; fila[C['Guisado']] = guisado; fila[C['Guarniciones']] = guarnTxt; fila[C['Bebida']] = bebida;
  fila[C['Postre']] = postre; fila[C['Comentarios']] = seguro(coment); fila[C['Estado']] = 'Nuevo';
  fila[C['Actualizado (ms)']] = ahora.getTime(); fila[C['Llave']] = key;
  hoja().appendRow(fila);
  subirVersion();
  return { ok: true, folio: folio, duplicado: false };
}

function listar(desde, hasta) {
  const d = new Date(desde).getTime(), h = new Date(hasta).getTime();
  if (isNaN(d) || isNaN(h)) throw fm('Rango de fechas inválido', 'validacion');
  const pedidos = leer().filter(f => { const x = new Date(f[C['Fecha y hora']]).getTime(); return x >= d && x < h; }).map(aObjeto);
  return { ok: true, pedidos: pedidos, version: version(), ahora: Date.now() };
}

function cambios(versionCliente, desde) {
  const v = version();
  if (String(versionCliente) === String(v)) return { ok: true, version: v, pedidos: [], ahora: Date.now() };
  const ms = Number(desde) || 0;
  const pedidos = leer().filter(f => Number(f[C['Actualizado (ms)']]) > ms).map(aObjeto);
  return { ok: true, version: v, pedidos: pedidos, ahora: Date.now() };
}

function actualizar(id, cambiosReq) {
  const h = hoja(), filas = leer();
  const i = filas.findIndex(f => f[C['Folio']] === id);
  if (i < 0) throw fm('El pedido ya no existe.', 'error');
  const f = filas[i], ahora = new Date();
  if ('estado' in cambiosReq) {
    if (ESTADOS.indexOf(cambiosReq.estado) < 0) throw fm('Estado no válido.', 'validacion');
    if (f[C['Estado']] !== cambiosReq.estado) { f[C['Estado']] = cambiosReq.estado; f[C['Cambio de estado']] = ahora; }
  }
  if ('notas_cocina' in cambiosReq) f[C['Notas de cocina']] = seguro(String(cambiosReq.notas_cocina || '').slice(0, 400));
  f[C['Actualizado (ms)']] = ahora.getTime();
  h.getRange(i + 2, 1, 1, COLS.length).setValues([f]);
  subirVersion();
  return { ok: true, pedido: aObjeto(f) };
}

/* ===================== Sesión por usuario ===================== */
function entrar(usuario) {
  const props = PropertiesService.getScriptProperties();
  const bloqueo = Number(props.getProperty('BLOQUEO_HASTA') || 0);
  if (Date.now() < bloqueo) throw fm('Demasiados intentos. Espera unos minutos.', 'auth');
  const esperado = props.getProperty('USUARIO_COCINA');
  if (!esperado || String(usuario || '').trim().toLowerCase() !== esperado) {
    const fallos = Number(props.getProperty('FALLOS') || 0) + 1;
    props.setProperty('FALLOS', String(fallos));
    if (fallos >= 10) { props.setProperty('BLOQUEO_HASTA', String(Date.now() + 10 * 60000)); props.setProperty('FALLOS', '0'); }
    throw fm('Usuario incorrecto.', 'auth');
  }
  props.setProperty('FALLOS', '0');
  const sesiones = leerSesiones(), token = Utilities.getUuid();
  sesiones[token] = Date.now() + SESION_DIAS * 86400000;
  const vigentes = Object.keys(sesiones).sort((a, b) => sesiones[b] - sesiones[a]).slice(0, 20);
  const limpio = {}; vigentes.forEach(k => limpio[k] = sesiones[k]);
  props.setProperty('SESIONES', JSON.stringify(limpio));
  return { ok: true, token: token, nombre: 'Cocina' };
}
function salir(token) {
  const s = leerSesiones(); delete s[token];
  PropertiesService.getScriptProperties().setProperty('SESIONES', JSON.stringify(s));
  return { ok: true };
}
function validarSesion(token) {
  const s = leerSesiones();
  if (!token || !s[token] || s[token] < Date.now()) throw fm('Tu sesión terminó. Vuelve a entrar.', 'permiso');
}
function leerSesiones() {
  try { const s = JSON.parse(PropertiesService.getScriptProperties().getProperty('SESIONES') || '{}'), n = Date.now(), r = {};
    Object.keys(s).forEach(k => { if (s[k] > n) r[k] = s[k]; }); return r; } catch (e) { return {}; }
}

/* ===================== Utilidades ===================== */
/* Funciona de dos formas:
   a) Proyecto creado desde la hoja (Extensiones > Apps Script): usa esa hoja.
   b) Proyecto creado en script.google.com: la primera vez crea la hoja
      "FIESTA MARKET | Pedidos" en tu Drive y recuerda su ID. */
function libro() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('HOJA_ID');
  if (id) return SpreadsheetApp.openById(id);
  const activa = SpreadsheetApp.getActiveSpreadsheet();
  if (activa) return activa;
  const nueva = SpreadsheetApp.create('FIESTA MARKET | Pedidos');
  props.setProperty('HOJA_ID', nueva.getId());
  return nueva;
}
function hoja() { return libro().getSheetByName(HOJA); }
function leer() {
  const h = hoja(), n = h.getLastRow() - 1;
  return n > 0 ? h.getRange(2, 1, n, COLS.length).getValues() : [];
}
function aObjeto(f) {
  const iso = v => v ? new Date(v).toISOString() : null;
  return {
    id: f[C['Folio']], folio: f[C['Folio']], creado_at: iso(f[C['Fecha y hora']]), nombre: String(f[C['Nombre']]).replace(/^'/, ''),
    empresa: f[C['Empresa']], platillo: f[C['Platillo']], guisado: f[C['Guisado']] || '',
    guarniciones: String(f[C['Guarniciones']] || '').split(', ').filter(String), bebida: f[C['Bebida']], postre: f[C['Postre']],
    comentarios: String(f[C['Comentarios']] || '').replace(/^'/, ''), estado: f[C['Estado']] || 'Nuevo',
    estado_cambiado_at: iso(f[C['Cambio de estado']]), notas_cocina: String(f[C['Notas de cocina']] || '').replace(/^'/, '')
  };
}
// Evita que un texto como "=IMPORTXML(...)" se ejecute como fórmula en la hoja
function seguro(v) { return /^[=+\-@]/.test(v) ? "'" + v : v; }
function version() { return PropertiesService.getScriptProperties().getProperty('VERSION') || '1'; }
function subirVersion() { const p = PropertiesService.getScriptProperties(); p.setProperty('VERSION', String(Number(p.getProperty('VERSION') || 1) + 1)); }
function conBloqueo(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw fm('El servidor está ocupado. Inténtalo de nuevo.', 'red');
  try { return fn(); } finally { lock.releaseLock(); }
}
function fm(mensaje, tipo) { const e = new Error(mensaje); e.fm = falla(mensaje, tipo); return e; }
function falla(mensaje, tipo) { return { ok: false, error: mensaje, tipo: tipo || 'error' }; }
function json(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
