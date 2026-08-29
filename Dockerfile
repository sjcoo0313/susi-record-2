FROM node:20-slim

WORKDIR /app

# Install build tools for native modules
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./
COPY client/package*.json ./client/

# Install root & client dependencies
RUN npm install
RUN cd client && npm install

# Copy all source files
COPY . .

# Build frontend
RUN cd client && npm run build

ENV PORT=3000
ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "server/index.js"]
