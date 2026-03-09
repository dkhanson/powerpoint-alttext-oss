# PowerPoint Alt-Text Generator V2 API Docker Container
# Multi-stage build for optimized production image

FROM python:3.11-slim as builder

# Set working directory for build
WORKDIR /build

# Set environment variables for build
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Install build dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    libxml2-dev \
    libxslt-dev \
    zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY setup.py .
COPY powerpoint_alttext_v2/ powerpoint_alttext_v2/

# Build wheel
RUN pip wheel --no-cache-dir --no-deps --wheel-dir /build/wheels .

# Production stage
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    libxml2 \
    libxslt1.1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create app user for security
RUN groupadd -r appuser && useradd -r -g appuser appuser

# Copy wheels from builder stage
COPY --from=builder /build/wheels /tmp/wheels/

# Install the application
RUN pip install --no-cache /tmp/wheels/*.whl && rm -rf /tmp/wheels

# Copy configuration template and startup script
COPY powerpoint_alttext_v2/config/default.toml /app/config_template.toml
COPY docker_start.py /app/docker_start.py

# Create directories for uploads and results
RUN mkdir -p /app/temp_uploads /app/api_results /app/config && \
    chown -R appuser:appuser /app

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 8001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8001/health || exit 1

# Run the API server
CMD ["python", "/app/docker_start.py"]