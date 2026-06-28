# apps/api/Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

# Install all dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the workspace
COPY . .

# Build the api
RUN npx nx build api --prod

FROM node:20-alpine AS runner
WORKDIR /app

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/dist/apps/api ./dist/apps/api

# Install prod dependencies
RUN npm install --omit=dev

ENV NODE_ENV=production
ENV PORT=3333

EXPOSE 3333

CMD ["node", "dist/apps/api/main.js"]
