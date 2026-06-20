# Chameleon.io — production container
FROM node:20-alpine

WORKDIR /app

# Install only production deps first (better layer caching)
COPY package*.json ./
RUN npm ci --omit=dev

# App source
COPY server ./server
COPY public ./public

ENV NODE_ENV=production
# Hosts inject PORT; default to 3000 for local docker runs.
ENV PORT=3000
EXPOSE 3000

CMD ["node", "server/index.js"]
