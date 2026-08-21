FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY . .

# Runtime media directories (kept as volumes in compose)
RUN mkdir -p uploads/videos uploads/processed uploads/snapshots uploads/reports

EXPOSE 5000

CMD ["node", "server.js"]
