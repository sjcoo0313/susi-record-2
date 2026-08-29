FROM node:20-slim

WORKDIR /app

# Install build tools for native SQLite compilation
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Copy entire source repository
COPY . .

# Install dependencies and build frontend
RUN npm install
RUN if [ -d "client" ]; then cd client && npm install && npm run build; fi

ENV PORT=3000
ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "server/index.js"]
