# WebUI Docker Container
# Lightweight container for serving static files with a custom Python server

FROM python:3.11-alpine

# Set working directory
WORKDIR /app

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Install curl for health checks
RUN apk add --no-cache curl

# Create app user for security
RUN addgroup -g 1001 -S appuser && \
    adduser -S appuser -G appuser

# Copy WebUI files
COPY *.html ./
COPY *.js ./
COPY server.py ./

# Copy config template as config.js (since config.js is gitignored)
COPY config.template.js ./config.js

# Set ownership
RUN chown -R appuser:appuser /app

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:80/ || exit 1

# Start the custom web server with SPA support
CMD ["python", "server.py"]