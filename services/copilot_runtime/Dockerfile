FROM node:20-slim

WORKDIR /app

COPY package*.json ./

RUN npm ci --omit=dev --legacy-peer-deps

COPY index.ts ./

ENV PORT=8001
EXPOSE 8001

CMD ["npx", "tsx", "index.ts"]
