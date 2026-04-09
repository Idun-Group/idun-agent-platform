FROM node:lts-alpine

WORKDIR /app

# Install dependencies (same as docker-compose dev setup)
COPY package*.json ./
RUN npm install

# Copy application source
COPY . .

EXPOSE 3000

# Run Vite dev server in the container, mirroring docker-compose.dev command
CMD ["sh", "-lc", "npm run dev -- --host 0.0.0.0 --port 3000"]
