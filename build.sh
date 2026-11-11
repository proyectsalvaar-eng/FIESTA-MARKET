#!/usr/bin/env bash
# Genera la carpeta docs/ lista para subir a un hosting (Netlify, Vercel, etc.)
#   docs/index.html          -> menú de pedidos
#   docs/cocina/index.html   -> panel privado de cocina (/cocina)
set -euo pipefail
cd "$(dirname "$0")"
rm -rf docs && mkdir -p docs/cocina docs/assets
doc(){ # $1 = fragmento, $2 = salida, $3 = prefijo de assets
  { echo '<!doctype html>'
    echo '<html lang="es"><head><meta charset="utf-8">'
    echo '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
    echo '<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>'
    sed "s#src=\"assets/#src=\"$3assets/#g" "$1"
    echo '</html>'; } > "$2"
}
doc index.html  docs/index.html        ""
doc cocina.html docs/cocina/index.html "../"
cp -r assets/* docs/assets/
printf 'User-agent: *\nDisallow: /cocina\n' > docs/robots.txt
touch docs/.nojekyll   # GitHub Pages: servir los archivos tal cual
echo "docs/ listo:"; find docs -type f | sort
