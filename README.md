# FIESTA MARKET

Menú digital de pedidos para empleados de NISSAN y FORD, con un panel de cocina en `/cocina/`.

- Sitio estático publicado con GitHub Pages desde la carpeta `docs/`.
- Pedidos guardados en Google Sheets mediante Google Apps Script (`backend/Code.gs`).
- Sin librerías externas.

Instalación y uso: **PUESTA-EN-MARCHA.md** · Publicación: **PUBLICAR-EN-GITHUB.md**

```bash
./build.sh          # genera docs/
```
```bash
node tests/backend-tests.js && node tests/e2e.js
```
