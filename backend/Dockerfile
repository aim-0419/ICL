FROM node:20-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY scripts ./scripts

ENV NODE_ENV=production \
    APP_ENV=production \
    PORT=4000
EXPOSE 4000

# Container environments inject configuration directly. The local npm wrapper
# intentionally requires an on-disk env file, so containers start the server
# entrypoint after the same runtime safety checks in src/server.js.
CMD ["node", "src/server.js"]
