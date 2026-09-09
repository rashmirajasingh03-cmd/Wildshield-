FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY . .

# Runtime media directories (kept as volumes in compose)
RUN mkdir -p uploads/videos uploads/processed uploads/snapshots uploads/reports

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:5000/health || exit 1

EXPOSE 5000

CMD ["node", "server.js"]
