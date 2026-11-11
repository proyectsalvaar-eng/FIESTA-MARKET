/* =====================================================================
   FIESTA MARKET — Capa de datos compartida (formulario + panel de cocina)
   - Con APPS_SCRIPT_URL en fm-config.js -> modo "sheets" (Google Sheets real)
   - Sin ella                            -> modo "demo" (sólo este navegador)
   Ambos modos exponen la misma API: window.FMBackend
   Sin librerías externas.
   ===================================================================== */
(function () {
  "use strict";
  const cfg = window.FM_CONFIG || {};
  const ESTADOS = ["Nuevo", "En preparación", "Listo", "Entregado"];
  const TIMEOUT_MS = 20000;
  const INTERVALO = Math.max(1, Number(cfg.INTERVALO_SEGUNDOS) || 10) * 1000;
  const MSG_RED = "No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo.";
  const TOKEN_KEY = "fm.cocina.token";

  function uuid() {
    if (window.crypto && crypto.randomUUID) { try { return crypto.randomUUID(); } catch (e) {} }
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    const h = [...b].map(x => x.toString(16).padStart(2, "0")).join("");
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }
  function fmError(userMessage, kind) { const e = new Error(userMessage); e.userMessage = userMessage; e.kind = kind || "error"; return e; }
  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} }
  };
  function normalizar(r) {
    return {
      id: r.id, folio: r.folio, creado_at: r.creado_at, nombre: r.nombre, empresa: r.empresa,
      platillo: r.platillo, guisado: r.guisado || "", guarniciones: Array.isArray(r.guarniciones) ? r.guarniciones : [],
      bebida: r.bebida, postre: r.postre, comentarios: r.comentarios || "", estado: r.estado,
      estado_cambiado_at: r.estado_cambiado_at || null, notas_cocina: r.notas_cocina || ""
    };
  }
  /* Sondeo: pregunta al servidor por cambios cada INTERVALO (pausa con la pestaña oculta) */
  function sondeo(paso, onEstado) {
    let vivo = true, fallos = 0, t = null;
    async function ciclo() {
      if (!vivo) return;
      if (!document.hidden) {
        try { await paso(); fallos = 0; onEstado && onEstado("conectado"); }
        catch (e) { fallos++; onEstado && onEstado(fallos >= 3 ? "desconectado" : "reconectando"); }
      }
      if (vivo) t = setTimeout(ciclo, INTERVALO);
    }
    ciclo();
    return () => { vivo = false; clearTimeout(t); };
  }

  /* ================================================================ */
  /*  MODO GOOGLE SHEETS (Apps Script)                                 */
  /* ================================================================ */
  function sheetsBackend() {
    async function llamar(accion, datos) {
      if (navigator.onLine === false) throw fmError(MSG_RED, "red");
      const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
      let res;
      try {
        // text/plain evita la verificación CORS previa que Apps Script no admite
        res = await fetch(cfg.APPS_SCRIPT_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify(Object.assign({ accion }, datos || {})), signal: ctl.signal, redirect: "follow" });
      } catch (e) { throw fmError(MSG_RED, "red"); } finally { clearTimeout(t); }
      let data;
      try { data = await res.json(); } catch (e) { throw fmError("El servidor respondió algo inesperado. Inténtalo de nuevo.", "error"); }
      if (!data || data.ok !== true) {
        if (data && data.tipo === "permiso") ls.del(TOKEN_KEY);
        throw fmError((data && data.error) || "No se pudo completar la operación.", (data && data.tipo) || "error");
      }
      return data;
    }
    const token = () => ls.get(TOKEN_KEY);
    let version = null, desde = 0;
    return {
      modo: "sheets",
      async crearPedido(p) {
        const d = await llamar("crear", { pedido: p });
        if (!d.folio) throw fmError("El servidor no confirmó el pedido. Inténtalo de nuevo.", "error");
        return { folio: d.folio, duplicado: !!d.duplicado };
      },
      async entrar(usuario) {
        const d = await llamar("entrar", { usuario });
        ls.set(TOKEN_KEY, d.token);
        return { nombre: d.nombre || "Cocina" };
      },
      async sesionActual() {
        if (!token()) return null;
        try { const d = await llamar("sesion", { token: token() }); return { nombre: d.nombre || "Cocina" }; }
        catch (e) { if (e.kind === "permiso") return null; throw e; }
      },
      async cerrarSesion() { const t = token(); ls.del(TOKEN_KEY); if (t) { try { await llamar("salir", { token: t }); } catch (e) {} } },
      async empresas() { return (await llamar("empresas")).empresas; },
      async listarPedidos({ desde: d, hasta: h }) {
        const r = await llamar("listar", { token: token(), desde: d.toISOString(), hasta: h.toISOString() });
        version = r.version; desde = r.ahora;
        return r.pedidos.map(normalizar);
      },
      async actualizarPedido(id, cambios) {
        const permitido = {};
        if ("estado" in cambios) { if (!ESTADOS.includes(cambios.estado)) throw fmError("Estado no válido.", "validacion"); permitido.estado = cambios.estado; }
        if ("notas_cocina" in cambios) permitido.notas_cocina = String(cambios.notas_cocina || "").slice(0, 400);
        return normalizar((await llamar("actualizar", { token: token(), id, cambios: permitido })).pedido);
      },
      suscribir({ onInsert, onUpdate, onEstado }) {
        const vistos = new Set();
        return sondeo(async () => {
          const r = await llamar("cambios", { token: token(), version, desde });
          version = r.version; desde = Math.max(desde, r.ahora - 5000);   // margen por relojes
          r.pedidos.map(normalizar).forEach(p => {
            const firma = p.id + "|" + p.estado + "|" + p.notas_cocina;
            if (vistos.has(firma)) return; vistos.add(firma);
            (p.estado === "Nuevo" && !p.estado_cambiado_at ? onInsert : onUpdate)(p);
          });
        }, onEstado);
      }
    };
  }

  /* ================================================================ */
  /*  MODO DEMOSTRACIÓN (sin servidor; datos sólo en este navegador)  */
  /* ================================================================ */
  function demoBackend() {
    const KEY = "fm.demo.v1", SES = "fm.demo.sesion", FAIL = "fm.demo.fallar";
    const leer = () => { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { return null; } };
    function base() {
      let db = leer();
      if (!db) { db = { seq: 0, pedidos: [] }; sembrar(db); ls.set(KEY, JSON.stringify(db)); }
      return db;
    }
    function escribir(db) { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { throw fmError("No se pudo guardar en este navegador.", "error"); } }
    function folio(db) {
      db.seq += 1;
      const d = new Date(), p = n => String(n).padStart(2, "0");
      return `FM-${String(d.getFullYear()).slice(2)}${p(d.getMonth() + 1)}${p(d.getDate())}-${String(db.seq).padStart(4, "0")}`;
    }
    function sembrar(db) {
      [
        ["María (ejemplo)", "NISSAN", "Comida del día", "Guisado de res", ["Arroz amarillo", "Frijoles charros", "Tortillas"], "Agua de jamaica", "Pan del día", "Sin cebolla", "Listo", 52],
        ["Jorge (ejemplo)", "FORD", "Tacos de carne", "", ["Papas fritas"], "Coca-Cola", "Gelatina del día", "", "En preparación", 31],
        ["Lupita (ejemplo)", "NISSAN", "Quesadilla de carne", "", ["Plátano asado"], "Agua de horchata", "Pastel del día", "Salsa aparte", "Nuevo", 9],
        ["Carlos (ejemplo)", "FORD", "Comida del día", "Guisado de pollo", ["Arroz blanco", "Frijoles negros", "Plátano asado"], "Sprite", "Pan del día", "", "Nuevo", 4],
        ["Ana (ejemplo)", "FORD", "Burrito de carne", "", ["Papas fritas"], "Squirt", "Gelatina del día", "Alergia al cacahuate", "Entregado", 75]
      ].forEach(e => {
        const f = folio(db);
        db.pedidos.push({ id: f, folio: f, idempotency_key: uuid(), creado_at: new Date(Date.now() - e[9] * 60000).toISOString(),
          nombre: e[0], empresa: e[1], platillo: e[2], guisado: e[3], guarniciones: e[4], bebida: e[5], postre: e[6],
          comentarios: e[7], estado: e[8], estado_cambiado_at: e[8] === "Nuevo" ? null : new Date().toISOString(), notas_cocina: "", actualizado: 0 });
      });
    }
    const espera = ms => new Promise(r => setTimeout(r, ms));
    const falla = () => ls.get(FAIL) === "1";

    return {
      modo: "demo",
      async crearPedido(p) {
        await espera(350);
        if (falla() || navigator.onLine === false) throw fmError(MSG_RED, "red");
        const db = base();
        const ya = db.pedidos.find(x => x.idempotency_key === p.idempotency_key);
        if (ya) return { folio: ya.folio, duplicado: true };
        const g = [...new Set(p.guarniciones || [])];
        if (!p.nombre || !p.empresa || !p.platillo || !p.bebida || !p.postre) throw fmError("Faltan datos del pedido.", "validacion");
        if (p.platillo === "Comida del día" ? (g.length !== 3 || !p.guisado) : g.length !== 1) throw fmError("Revisa las guarniciones del pedido.", "validacion");
        const f = folio(db);
        db.pedidos.push({ id: f, folio: f, idempotency_key: p.idempotency_key, creado_at: new Date().toISOString(),
          nombre: String(p.nombre).slice(0, 60), empresa: p.empresa, platillo: p.platillo,
          guisado: p.platillo === "Comida del día" ? p.guisado : "", guarniciones: g.sort(), bebida: p.bebida, postre: p.postre,
          comentarios: String(p.comentarios || "").slice(0, 400), estado: "Nuevo", estado_cambiado_at: null, notas_cocina: "", actualizado: Date.now() });
        escribir(db);
        return { folio: f, duplicado: false };
      },
      async entrar(usuario) {
        await espera(250);
        if (String(usuario || "").trim().toLowerCase() !== String(cfg.DEMO_USUARIO).toLowerCase()) throw fmError("Usuario incorrecto.", "auth");
        try { sessionStorage.setItem(SES, "1"); } catch (e) {}
        return { nombre: "Cocina (demo)" };
      },
      async sesionActual() {
        let ok = false; try { ok = sessionStorage.getItem(SES) === "1"; } catch (e) {}
        return ok ? { nombre: "Cocina (demo)" } : null;
      },
      async cerrarSesion() { try { sessionStorage.removeItem(SES); } catch (e) {} },
      async empresas() { return ["NISSAN", "FORD"]; },
      async listarPedidos({ desde, hasta }) {
        await espera(150);
        if (falla()) throw fmError(MSG_RED, "red");
        return base().pedidos.filter(p => { const t = new Date(p.creado_at); return t >= desde && t < hasta; })
          .sort((a, b) => a.creado_at.localeCompare(b.creado_at)).map(normalizar);
      },
      async actualizarPedido(id, cambios) {
        await espera(200);
        if (falla()) throw fmError(MSG_RED, "red");
        const db = base(); const p = db.pedidos.find(x => x.id === id);
        if (!p) throw fmError("El pedido ya no existe.", "error");
        if ("estado" in cambios) {
          if (!ESTADOS.includes(cambios.estado)) throw fmError("Estado no válido.", "validacion");
          if (p.estado !== cambios.estado) { p.estado = cambios.estado; p.estado_cambiado_at = new Date().toISOString(); }
        }
        if ("notas_cocina" in cambios) p.notas_cocina = String(cambios.notas_cocina || "").slice(0, 400);
        p.actualizado = Date.now();
        escribir(db);
        return normalizar(p);
      },
      suscribir({ onInsert, onUpdate, onEstado }) {
        let desde = Date.now();
        return sondeo(async () => {
          if (falla()) throw fmError(MSG_RED, "red");
          const ahora = Date.now();
          base().pedidos.filter(p => p.actualizado > desde).forEach(p =>
            (p.estado === "Nuevo" && !p.estado_cambiado_at ? onInsert : onUpdate)(normalizar(p)));
          desde = ahora;
        }, onEstado);
      }
    };
  }

  const live = !!cfg.APPS_SCRIPT_URL;
  window.FMBackend = Object.assign(live ? sheetsBackend() : demoBackend(), { uuid, ESTADOS });
})();
