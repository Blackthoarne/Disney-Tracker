# First Light — Disney Edition
# Zero-dependency Node app: the image is the repo plus the Node runtime.
FROM node:22-alpine

ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/config

WORKDIR /app

# No `npm install` — there are no dependencies. Copy source only.
COPY server ./server
COPY public ./public
COPY modules ./modules
COPY admin ./admin
COPY package.json ./package.json

# Persistent data (store, curated, backups) lives here.
VOLUME /config

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/api/health || exit 1

CMD ["node", "server/index.js"]
