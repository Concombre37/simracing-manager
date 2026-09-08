# Déploiement portable

L’application ne dépend pas d’un domaine codé dans le frontend : les appels passent par `/api`. Pour déplacer l’installation, copie `.env.example` en `.env`, change `PUBLIC_URL`, `PUBLIC_HOST`, `BACKEND_PORT` et `CORS_ORIGIN`, puis génère la configuration Nginx :

```bash
node scripts/render-nginx-config.mjs deploy/.env nginx-simracing.generated.conf
```

Le fichier généré pointe vers le backend local sur `BACKEND_PORT`. Après reconstruction, applique aussi la migration Prisma si le schéma a changé, puis redémarre le service backend. Chaque agent Windows doit avoir `SERVER_URL` réglé sur `PUBLIC_URL` dans son fichier `.env`.

Les valeurs par défaut restent compatibles avec `https://simracing.hytlabs.com`.
