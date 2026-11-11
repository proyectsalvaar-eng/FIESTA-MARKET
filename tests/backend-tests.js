// Pruebas de backend/Code.gs (validación, duplicados, acceso). Uso: node tests/backend-tests.js
const { crearContexto } = require('./gas-emulador');
const g = crearContexto('usuario-prueba');
const res = []; const ok = (n, c, d = '') => res.push([c ? 'PASA' : 'FALLA', n, String(d).slice(0, 60)]);
const k = n => `aaaaaaaa-0000-0000-0000-${String(n).padStart(12, '0')}`;
const base = { nombre: 'Ana Pérez', empresa: 'NISSAN', platillo: 'Comida del día', guisado: 'Guisado de res',
  guarniciones: ['Tortillas', 'Arroz blanco', 'Frijoles charros'], bebida: 'Agua de jamaica', postre: 'Pan del día', comentarios: 'Sin cebolla' };

// --- Alta de pedidos ---
let r = g.post({ accion: 'crear', pedido: { ...base, idempotency_key: k(1) } });
const folio = r.folio;
ok('crear comida del día', r.ok && /^FM-\d{6}-0001$/.test(r.folio) && !r.duplicado, r.folio);
r = g.post({ accion: 'crear', pedido: { ...base, idempotency_key: k(1) } });
ok('reintento con misma llave no duplica', r.folio === folio && r.duplicado, r.folio);
r = g.post({ accion: 'crear', pedido: { ...base, nombre: 'ana pérez', guarniciones: ['Arroz blanco', 'Frijoles charros', 'Tortillas'], idempotency_key: k(2) } });
ok('mismo pedido en <2 min no duplica', r.folio === folio && r.duplicado, r.folio);
r = g.post({ accion: 'crear', pedido: { nombre: 'Luis', empresa: 'FORD', platillo: 'Tacos de carne', guisado: 'Guisado de res', guarniciones: ['Papas fritas'], bebida: 'Coca-Cola', postre: 'Gelatina del día', idempotency_key: k(3) } });
ok('crear tacos (FORD)', r.ok && !r.duplicado, r.folio);
ok('combo guarda sin guisado', g.hojas.Pedidos.filas[2][5] === '', JSON.stringify(g.hojas.Pedidos.filas[2][5]));

const malos = [
  ['2 guarniciones', { ...base, guarniciones: ['Tortillas', 'Arroz blanco'] }],
  ['4 guarniciones', { ...base, guarniciones: ['Tortillas', 'Arroz blanco', 'Papas fritas', 'Frijoles negros'] }],
  ['3 iguales cuentan como 1', { ...base, guarniciones: ['Tortillas', 'Tortillas', 'Tortillas'] }],
  ['sin guisado', { ...base, guisado: '' }],
  ['empresa inexistente', { ...base, empresa: 'TESLA' }],
  ['guarnición de combo inválida', { ...base, platillo: 'Burrito de carne', guarniciones: ['Arroz blanco'] }],
  ['nombre vacío', { ...base, nombre: '   ' }],
  ['bebida inventada', { ...base, bebida: 'Cerveza' }],
  ['sin llave', { ...base }]
];
malos.forEach(([n, p], i) => {
  const pedido = n === 'sin llave' ? p : { ...p, idempotency_key: k(100 + i) };
  const x = g.post({ accion: 'crear', pedido });
  ok('rechaza: ' + n, x.ok === false && x.tipo === 'validacion', x.error);
});
r = g.post({ accion: 'crear', pedido: { ...base, nombre: '=IMPORTXML("http://x")', idempotency_key: k(200) } });
ok('fórmulas en el nombre no se ejecutan en la hoja', r.ok && String(g.hojas.Pedidos.filas.at(-1)[2]).startsWith("'="), g.hojas.Pedidos.filas.at(-1)[2]);
ok('JSON inválido rechazado', g.post('esto no es json').ok === false);

// --- Acceso ---
const hoy = new Date(); hoy.setHours(0, 0, 0, 0); const manana = new Date(hoy.getTime() + 86400000);
r = g.post({ accion: 'listar', desde: hoy.toISOString(), hasta: manana.toISOString() });
ok('sin entrar NO se pueden ver pedidos', r.ok === false && r.tipo === 'permiso', r.error);
r = g.post({ accion: 'listar', token: 'inventado', desde: hoy.toISOString(), hasta: manana.toISOString() });
ok('token inventado NO ve pedidos', r.ok === false && r.tipo === 'permiso');
r = g.post({ accion: 'actualizar', id: folio, cambios: { estado: 'Listo' } });
ok('sin entrar NO se cambian estados', r.ok === false && r.tipo === 'permiso');
r = g.post({ accion: 'entrar', usuario: 'cocina' });
ok('usuario incorrecto rechazado', r.ok === false && r.tipo === 'auth', r.error);
r = g.post({ accion: 'entrar', usuario: '  Usuario-Prueba ' });
const token = r.token;
ok('usuario correcto entra (sin contraseña, sin código)', r.ok && /^[0-9a-f-]{36}$/.test(token));
r = g.post({ accion: 'listar', token, desde: hoy.toISOString(), hasta: manana.toISOString() });
ok('cocina ve todos los pedidos del día', r.ok && r.pedidos.length === 3, r.pedidos && r.pedidos.length);
ok('pedido trae guarniciones como lista', r.ok && Array.isArray(r.pedidos[0].guarniciones) && r.pedidos[0].guarniciones.length === 3);
const v0 = r.version;
r = g.post({ accion: 'cambios', token, version: v0, desde: r.ahora });
ok('sin cambios: respuesta vacía', r.ok && r.pedidos.length === 0);
r = g.post({ accion: 'actualizar', token, id: folio, cambios: { estado: 'En preparación' } });
ok('cocina cambia estado', r.ok && r.pedido.estado === 'En preparación' && r.pedido.estado_cambiado_at);
r = g.post({ accion: 'cambios', token, version: v0, desde: Date.now() - 60000 });
ok('cambios detecta la actualización', r.ok && r.pedidos.some(p => p.id === folio && p.estado === 'En preparación'));
r = g.post({ accion: 'actualizar', token, id: folio, cambios: { estado: 'Cancelado' } });
ok('estado inválido rechazado', r.ok === false && r.tipo === 'validacion');
r = g.post({ accion: 'actualizar', token, id: folio, cambios: { nombre: 'Hackeado', notas_cocina: 'Sin tortilla' } });
ok('sólo se pueden cambiar estado y notas', r.ok && r.pedido.nombre === 'Ana Pérez' && r.pedido.notas_cocina === 'Sin tortilla');
g.post({ accion: 'salir', token });
r = g.post({ accion: 'listar', token, desde: hoy.toISOString(), hasta: manana.toISOString() });
ok('al salir, el token deja de servir', r.ok === false && r.tipo === 'permiso');
for (let i = 0; i < 10; i++) g.post({ accion: 'entrar', usuario: 'adivina' + i });
r = g.post({ accion: 'entrar', usuario: 'usuario-prueba' });
ok('10 intentos fallidos bloquean 10 minutos', r.ok === false && /Demasiados/.test(r.error), r.error);

const w = Math.max(...res.map(x => x[1].length));
res.forEach(x => console.log(`${x[0].padEnd(6)} ${x[1].padEnd(w)}  ${x[2]}`));
const pasa = res.filter(x => x[0] === 'PASA').length;
console.log(`\n${pasa} de ${res.length} pruebas pasaron`);
process.exit(pasa === res.length ? 0 : 1);
