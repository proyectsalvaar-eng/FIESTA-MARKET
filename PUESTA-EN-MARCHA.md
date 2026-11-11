# FIESTA MARKET: puesta en marcha (Google Sheets + GitHub Pages)

## Cómo está armado

```
Cliente (celular) ──► menú (GitHub Pages) ──┐
                                            ├──► Apps Script ──► Hoja "FIESTA MARKET | Pedidos" (tu Google Drive)
Cocinera (tablet) ──► /cocina (GitHub Pages) ┘       (revisa cada 10 s)
```

- **Sin librerías externas ni servicios nuevos:** sólo GitHub (publica la página) y tu cuenta de Google (guarda los pedidos).
- La cocinera entra sólo con su **usuario** (el que tú elijas), sin contraseña ni códigos. La tablet recuerda la sesión 30 días.
- El usuario se guarda **sólo dentro de Apps Script**. No aparece en el código del sitio, que es público en GitHub.

| Archivo | Qué es |
|---|---|
| `index.html` | Menú de pedidos. |
| `cocina.html` | Panel de cocina. Se publica en `/cocina/`. |
| `assets/fm-config.js` | Aquí va la URL de Apps Script. |
| `assets/fm-backend.js` | Conexión con la hoja (menú y panel). |
| `backend/Code.gs` | El programa que se pega en Apps Script. |
| `build.sh` | Genera `docs/`, la carpeta que publica GitHub Pages. |
| `tests/` | Pruebas automáticas. |

## 1. Crear la hoja y el servidor (unos 10 minutos)
Hazlo con la sesión de Google de **proyectsalvaar@gmail.com**:

1. Abre https://sheets.new y nombra la hoja **FIESTA MARKET | Pedidos**.
2. Menú **Extensiones > Apps Script**. Borra lo que aparece y pega todo el contenido de `backend/Code.gs`.
3. En la línea `const USUARIO_INICIAL = 'ESCRIBE_AQUI_EL_USUARIO';` cambia el texto por el usuario de cocina.
   Esto se queda en Google; no lo cambies en GitHub.
4. Guarda. Arriba elige la función **configurar** y presiona **Ejecutar**.
   Google pedirá permisos: *Revisar permisos > tu cuenta > Configuración avanzada > Ir a… > Permitir*.
   El aviso de "app no verificada" es normal, porque el programa es tuyo.
5. **Implementar > Nueva implementación**. En el engrane elige **Aplicación web**:
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquier persona**
6. Presiona **Implementar** y copia la **URL de la aplicación web** (termina en `/exec`).
   Si la abres en el navegador debe mostrar `{"ok":true,...}`.

## 2. Conectar el sitio
1. Pega esa URL en `assets/fm-config.js`, en `APPS_SCRIPT_URL`.
2. Ejecuta `./build.sh`. Se actualiza la carpeta `docs/`.
3. Publica en GitHub (ver PUBLICAR-EN-GITHUB.md).

## 3. Prueba final
1. Desde un celular abre el menú y haz un pedido. Debe mostrar un folio como `FM-261111-0001` y aparecer en la hoja.
2. En la tablet abre `/cocina/` y entra con el usuario de cocina. El pedido aparece en menos de 10 segundos.
3. Cambia su estado y comprueba que también cambia en la hoja.

## Uso diario
- La cocinera trabaja en el panel `/cocina/`. La hoja de Google es el archivo de respaldo y de reportes; no hace falta abrirla.
- **Exportar** en el panel descarga un CSV o copia los pedidos para pegarlos en otra hoja.
- **No edites ni borres columnas** de la pestaña *Pedidos*. Las dos últimas columnas están ocultas porque las usa el sistema.

## Cambiar el usuario de cocina
En Apps Script: cambia `USUARIO_INICIAL` y ejecuta la función **cambiarUsuario**. Se cierran todas las sesiones abiertas y hay que volver a entrar con el usuario nuevo.

## Cambiar el menú o agregar una empresa
Las opciones válidas viven en dos lugares, que deben coincidir:
- `CONFIG` en `index.html`, lo que ve el cliente.
- `EMPRESAS` y `MENU` en `Code.gs` (Apps Script), lo que acepta el servidor.

Si cambias `Code.gs`, publica la nueva versión: **Implementar > Administrar implementaciones > Editar (lápiz) > Versión: Nueva versión > Implementar**. La URL no cambia.

## Límites que conviene conocer
- **Seguridad del usuario:** quien conozca el usuario puede ver los pedidos del día (nombres y platillos). Compártela sólo con la cocinera y cámbiala si alguien que no debe la conoce.
  Tras 10 intentos fallidos seguidos, la entrada se bloquea 10 minutos. Las sesiones ya abiertas siguen funcionando.
- **Retraso:** los pedidos tardan hasta 10 segundos en aparecer en el panel. Puedes cambiarlo en `INTERVALO_SEGUNDOS`; no conviene bajarlo de 5 por los límites de Google.
- **Cuotas gratuitas de Google:** una cuenta personal tiene unos 90 minutos de ejecución de Apps Script al día. Un panel abierto 10 horas, revisando cada 10 segundos, usa una fracción de eso. Si hay 2 o 3 tablets abiertas todo el día, sube el intervalo a 15 o 20 segundos.
- La hoja funciona bien con miles de pedidos. Para mantenerla ágil, archiva los pedidos de meses anteriores en otra hoja cada cierto tiempo.

## Pruebas
```bash
node tests/backend-tests.js
```
```bash
./build.sh && node tests/e2e.js
```
```bash
MODO=demo node tests/e2e.js
```
`backend-tests.js` y `e2e.js` ejecutan el mismo `Code.gs` en un simulador de Google, así que prueban la lógica real sin tocar tu hoja.
