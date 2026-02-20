#!/bin/sh
set -e

: "${API_PROXY_TARGET:?API_PROXY_TARGET env var is required}"

# Extract hostname from API_PROXY_TARGET for the Host header
API_HOST=$(echo "${API_PROXY_TARGET}" | sed 's|https\?://||' | sed 's|/.*||')

cat > /etc/nginx/conf.d/default.conf <<EOF
server {
    listen 8080;
    root /usr/share/nginx/html;
    index index.html;

    resolver 8.8.8.8 valid=30s;

    location /api/ {
        set \$backend ${API_PROXY_TARGET};
        proxy_pass \$backend;
        proxy_ssl_server_name on;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
EOF

exec "$@"
