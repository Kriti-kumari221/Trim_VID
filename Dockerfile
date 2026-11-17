# Multi-stage Dockerfile for ClipTrim HD Studio
# Stage 1: Build Frontend SPA
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
ARG VITE_API_BASE_URL=
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN rm -f .env.production && npm run build

# Stage 2: Production Python Backend with FFmpeg
FROM python:3.11-slim
WORKDIR /app

# Install system dependencies: FFmpeg, git, curl
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY backend/requirements.txt ./backend/
RUN pip install --no-cache-dir -r backend/requirements.txt

# Copy backend code
COPY backend/ ./backend/

# Copy built frontend assets from stage 1 into frontend/dist
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Persistent data directory
ENV DATA_DIR=/app/data
ENV FRONTEND_DIST=/app/frontend/dist
ENV PORT=8000
RUN mkdir -p /app/data

EXPOSE 8000

# Start Uvicorn serving both API and static SPA
CMD ["sh", "-c", "uvicorn backend.app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
