FROM node:20-alpine

WORKDIR /app

# Copy server package files
COPY server/package*.json ./

# Install dependencies
RUN npm ci --omit=dev

# Copy server source code
COPY server/ ./

EXPOSE 3000

CMD ["npm", "start"] 