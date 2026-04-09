#!/bin/sh
set -e

cat > /usr/share/nginx/html/config.js <<EOF
window.__RUNTIME_CONFIG__ = {
  API_URL: "${API_URL:-}",
  COPILOT_RUNTIME_URL: "${COPILOT_RUNTIME_URL:-}",
  AUTH_DISABLE_USERNAME_PASSWORD: "${AUTH_DISABLE_USERNAME_PASSWORD:-false}",
  USE_MOCKS: "${USE_MOCKS:-false}"
};
EOF

exec nginx -g "daemon off;"
