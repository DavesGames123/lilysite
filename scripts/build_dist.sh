#!/usr/bin/env bash
# Copy only the files the live site uses from public/ into dist/, for GitHub Pages.
# Every deploy stamps its CSS, JS and module imports with the commit (?v=SHA), so a
# browser never mixes a cached old script with a new page.
set -euo pipefail
cd "$(dirname "$0")/.."
V="$(git rev-parse --short HEAD 2>/dev/null || date +%s)"
rm -rf dist
mkdir -p dist/assets/lily
cp public/index.html public/styles.css public/editor.css public/favicon.svg public/favicon.ico public/center.webp \
   public/CNAME public/site.webmanifest public/robots.txt public/sitemap.xml dist/
cp -R public/js public/frames public/icons public/edit dist/
cp public/assets/lily/lily_stylized_approved.png dist/assets/lily/
find dist -name .DS_Store -delete
sed -i.bak -e "s#href=\"/styles.css\"#href=\"/styles.css?v=$V\"#" -e "s#href=\"/editor.css\"#href=\"/editor.css?v=$V\"#" \
   -e "s#src=\"/js/main.js\"#src=\"/js/main.js?v=$V\"#" -e "s#src=\"/js/editor.js\"#src=\"/js/editor.js?v=$V\"#" dist/index.html
for f in dist/js/*.js; do sed -i.bak -E "s#from \"\./([a-z]+)\.js\"#from \"./\1.js?v=$V\"#g" "$f"; done
find dist -name '*.bak' -delete
echo "dist/: $(find dist -type f | wc -l | tr -d ' ') files, $(du -sh dist | cut -f1), version $V"
