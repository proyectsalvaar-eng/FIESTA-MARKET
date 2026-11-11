/* =====================================================================
   FIESTA MARKET — Conexión con Google Sheets
   APPS_SCRIPT_URL: la "URL de la aplicación web" de Apps Script
   (termina en /exec). Ver PUESTA-EN-MARCHA.md.

   Este archivo es público (GitHub): NO pongas aquí el usuario de cocina.
   El usuario se guarda sólo dentro de Apps Script.

   Si APPS_SCRIPT_URL está vacío, el sitio funciona en MODO DEMOSTRACIÓN:
   los pedidos se guardan sólo en el navegador (para pruebas).
   ===================================================================== */
window.FM_CONFIG = {
  APPS_SCRIPT_URL: "",

  // Cada cuántos segundos el panel revisa si hay pedidos nuevos
  INTERVALO_SEGUNDOS: 10,

  // Sólo para el modo demostración
  DEMO_USUARIO: "demo"
};
