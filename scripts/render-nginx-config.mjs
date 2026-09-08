import { readFile, writeFile } from 'node:fs/promises';

const [, , envFile = 'deploy/.env', outputFile = 'nginx-simracing.generated.conf'] = process.argv;

const values = {
  PUBLIC_URL: 'https://simracing.hytlabs.com',
  PUBLIC_HOST: 'simracing.hytlabs.com',
  BACKEND_PORT: '3002',
};

try {
  const content = await readFile(envFile, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (match && match[1] in values) values[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

const config = `server {
    listen 80;
    listen [::]:80;
    server_name ${values.PUBLIC_HOST};
    client_max_body_size 20M;

    location ^~ /.well-known/acme-challenge/ {
        default_type "text/plain";
        root /var/www/simracing;
    }

    location / {
        proxy_pass http://127.0.0.1:${values.BACKEND_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $http_host;
        proxy_buffering off;
    }

    location /socket.io/ {
        proxy_pass http://127.0.0.1:${values.BACKEND_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
    }
}
`;

await writeFile(outputFile, config, 'utf8');
console.log(`Nginx config generated for ${values.PUBLIC_URL} -> 127.0.0.1:${values.BACKEND_PORT}`);
