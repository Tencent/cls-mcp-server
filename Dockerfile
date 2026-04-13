# ---- Build Stage ----
FROM node:22-alpine AS builder

WORKDIR /app

# Copy dependency files first for better layer caching
COPY package.json package-lock.json ./

# Install all dependencies (including devDependencies for building)
# Ignore prepare script to skip husky install in Docker
RUN npm ci --ignore-scripts

# Copy source code and build config
COPY src/ src/
COPY tsconfig.json webpack.config.js ./

# Build the project
RUN npm run build

# ---- Production Stage ----
FROM node:22-alpine

WORKDIR /app

# Copy dependency files and install production dependencies only
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Copy built artifacts from builder stage
COPY --from=builder /app/dist ./dist

# Default environment variables
ENV TRANSPORT=sse \
    PORT=3000

EXPOSE 3000

CMD ["node", "--disable-warning=DEP0040", "dist/index.js"]
