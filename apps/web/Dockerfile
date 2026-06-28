# apps/web/Dockerfile
FROM node:20-alpine

WORKDIR /app

# Copy package config and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the workspace
COPY . .

# Build the Next.js app via Nx
RUN npx nx build web --prod

# Set environment variables for Next.js
ENV NODE_ENV=production
ENV PORT=4200
EXPOSE 4200

# Start the built Next.js server using Nx production configuration
CMD ["npx", "nx", "serve", "web", "--prod"]
