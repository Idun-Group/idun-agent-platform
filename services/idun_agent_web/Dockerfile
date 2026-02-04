FROM --platform=linux/amd64 node:lts-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

RUN npx vite build

FROM --platform=linux/amd64 nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html

RUN mkdir -p /etc/nginx/templates && echo 'server { \
    listen 8080; \
    root /usr/share/nginx/html; \
    index index.html; \
    resolver 8.8.8.8 valid=30s; \
    location /copilotkit-virtual/ { \
        set $copilot_runtime "${COPILOT_RUNTIME_URL}"; \
        rewrite ^/copilotkit-virtual(.*)$ /copilotkit$1 break; \
        proxy_pass $copilot_runtime; \
        proxy_http_version 1.1; \
        proxy_set_header Host $proxy_host; \
        proxy_buffering off; \
    } \
    location / { \
        try_files $uri $uri/ /index.html; \
    } \
}' > /etc/nginx/templates/default.conf.template

EXPOSE 8080

CMD ["sh", "-c", "envsubst '${COPILOT_RUNTIME_URL}' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]
