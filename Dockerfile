# ─── Stage 1: Build React frontend ──────────────────────────────────────────
FROM node:20-slim AS frontend-builder

WORKDIR /app/frontend

# Install dependencies first (layer cache)
COPY frontend/package*.json ./
RUN npm ci

# Build the React app
COPY frontend/ .
RUN npm run build

# ─── Stage 2: Python + FastAPI runtime ───────────────────────────────────────
FROM python:3.12-slim

WORKDIR /app

# System dependencies for psycopg2
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev gcc \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY app/ ./app/

# Copy built frontend from Stage 1
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Copy seed script
COPY seed/ ./seed/

# Create logs directory
RUN mkdir -p logs

# Expose port (Render sets $PORT)
EXPOSE 8000

# Run with uvicorn; $PORT is set by Render (default 8000 locally)
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]

