# ---- Build stage ----
FROM node:22-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci

COPY apps/api/ apps/api/
RUN npm run build:api

# ---- Runtime stage ----
FROM node:22-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 python3-pip && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev

COPY --from=builder /app/apps/api/dist apps/api/dist
COPY services/python services/python
RUN pip3 install --no-cache-dir --break-system-packages -r services/python/requirements.txt

ENV NODE_ENV=production
EXPOSE 4000

CMD ["node", "apps/api/dist/main.js"]
