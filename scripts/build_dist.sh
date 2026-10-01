#!/usr/bin/env bash
# Copy only the files the live site uses from public/ into dist/, for upload to a host.
# The source video and the earlier eye-rig assets stay out.
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf dist
mkdir -p dist/assets/lily
cp public/index.html public/styles.css public/favicon.svg public/center.webp public/CNAME dist/
cp -R public/js public/frames dist/
cp public/assets/lily/lily_stylized_approved.png dist/assets/lily/
find dist -name .DS_Store -delete
echo "dist/: $(find dist -type f | wc -l | tr -d ' ') files, $(du -sh dist | cut -f1)"
