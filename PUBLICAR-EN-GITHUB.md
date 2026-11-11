# Publicar FIESTA MARKET en GitHub Pages

Al terminar tendrás:
- **Menú para clientes:** `https://TU-USUARIO.github.io/fiesta-market/`
- **Panel de cocina:** `https://TU-USUARIO.github.io/fiesta-market/cocina/`

En una cuenta gratuita el repositorio debe ser **público**. No hay riesgo: el código no contiene el usuario de cocina ni datos de clientes; los pedidos viven en tu Google Drive.

El repositorio guarda el proyecto completo. GitHub Pages publica sólo la carpeta `docs/`, que genera `./build.sh`.

## Opción A: lo publico yo desde esta sesión
1. Conecta GitHub en https://claude.ai/connect-github e instala la app de Claude en tu cuenta.
2. Crea en GitHub un repositorio **vacío y público** llamado `fiesta-market` (sin README).
3. Dime tu usuario de GitHub. Yo subo el proyecto y te aviso antes de activar la publicación.
4. Activa Pages (ver paso 3 de la opción B), o dime y te indico exactamente dónde.

## Opción B: desde el navegador, sin instalar nada
### 1. Crear el repositorio
1. En GitHub: **+ > New repository**.
2. Nombre: `fiesta-market`, visibilidad **Public**.
3. Presiona **Create repository**.

### 2. Subir los archivos
1. **uploading an existing file** (o **Add file > Upload files**).
2. Arrastra **todo el contenido** de la carpeta del proyecto: `docs`, `assets`, `backend`, `tests`, `index.html`, `cocina.html`, `build.sh` y las guías.
   Lo indispensable es la carpeta `docs` completa.
3. Presiona **Commit changes**.

### 3. Activar GitHub Pages
1. **Settings > Pages**.
2. *Source*: **Deploy from a branch**.
3. *Branch*: **main**, carpeta **/docs** y presiona **Save**.
4. En 1 a 3 minutos aparece *"Your site is live at …"*.

### 4. Probar
1. Abre el menú en tu celular y haz un pedido.
2. Abre `/cocina/` en la tablet y entra con el usuario de cocina.

## Actualizar el sitio después
1. Cambia lo necesario y ejecuta `./build.sh`.
2. Sube la carpeta `docs` actualizada (**Add file > Upload files**) y haz **Commit changes**.
3. En 1 o 2 minutos se ve el cambio. Si no, recarga con Ctrl/Cmd + Shift + R.

## Bueno saber
- **Dominio propio** (por ejemplo `pedidos.fiestamarket.mx`): **Settings > Pages > Custom domain**.
- Si el sitio abre sin estilos o sin fotos, revisa que Pages use la carpeta **/docs**.
- Comparte con los clientes sólo el link del menú. El link `/cocina/` es para la cocinera.
