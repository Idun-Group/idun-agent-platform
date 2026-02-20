FROM node:lts-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ARG VITE_COPILOT_RUNTIME_URL
ENV VITE_COPILOT_RUNTIME_URL=$VITE_COPILOT_RUNTIME_URL

ARG VITE_AUTH_DISABLE_USERNAME_PASSWORD
ENV VITE_AUTH_DISABLE_USERNAME_PASSWORD=$VITE_AUTH_DISABLE_USERNAME_PASSWORD

RUN npx vite build

FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 8080

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
