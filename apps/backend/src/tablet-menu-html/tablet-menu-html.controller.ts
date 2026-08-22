import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

// Un niveau plus profond que app.module.ts (ce fichier vit dans son propre
// sous-dossier de module) — 4 remontées, pas 3, pour atteindre la racine du
// monorepo dans l'image Docker (/app).
const DIST_ROOT = join(__dirname, '../../../..', 'apps/frontend/dist');

// /tablet-menu est exclue du serveur statique générique (voir app.module.ts)
// pour pouvoir injecter un <link rel="modulepreload"> vers son propre chunk
// JS avant que le navigateur n'ait exécuté le bundle principal — sans ça, la
// chaîne de requêtes (HTML -> bundle principal -> chunk TabletMenu -> appels
// API) s'exécute entièrement en série (audit PageSpeed mobile,
// "network-dependency-tree-insight"). Le nom de fichier du chunk change à
// chaque build (hash Vite) donc résolu par lecture du dossier assets, pas en
// dur — mis en cache au premier accès, un redéploiement redémarre le
// conteneur donc invalide naturellement le cache.
let cachedHtml: string | undefined;

function findTabletMenuChunk(): string | undefined {
  const assetsDir = join(DIST_ROOT, 'assets');
  const files = readdirSync(assetsDir);
  return files.find((f) => /^TabletMenu-.*\.js$/.test(f));
}

function buildHtml(): string {
  const html = readFileSync(join(DIST_ROOT, 'index.html'), 'utf-8');
  const chunk = findTabletMenuChunk();
  if (!chunk) return html;
  const preload = `<link rel="modulepreload" href="/assets/${chunk}" />\n  </head>`;
  return html.replace('</head>', preload);
}

@Controller()
export class TabletMenuHtmlController {
  @Get('tablet-menu')
  serve(@Res() res: Response): void {
    if (!cachedHtml) {
      cachedHtml = buildHtml();
    }
    res.setHeader('Content-Type', 'text/html');
    res.send(cachedHtml);
  }
}
