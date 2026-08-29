FROM node:22-slim

WORKDIR /app

# Install build tools for native SQLite compilation
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Copy pre-built app and server files
COPY . .

# Install server dependencies only
RUN npm install --ignore-scripts

ENV PORT=3000
ENV NODE_ENV=production

EXPOSE 3000

CMD ["sh", "-c", "if [ -f server/index.js ]; then node server/index.js; elif [ -f index.js ]; then node index.js; else node -e 'console.log(fs.readdirSync(\".\"))'; fi"]
