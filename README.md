# PowerPoint Alt-Text Generator

Automatically generate descriptive alt-text for images and shapes in PowerPoint
presentations using OpenAI (or Azure OpenAI) GPT-4 Vision.

## Features

- **4-method image extraction** -- finds images that standard python-pptx misses
  (direct Picture access, picture fill, XML blip parsing, XPath queries)
- **Reading-order annotation** -- physically reorders XML so screen readers follow
  the correct sequence
- **Connector alt-text** -- describes arrows/lines connecting shapes
- **Decorative flagging** -- marks decorative elements so assistive tech can skip them
- **Title deduplication** -- auto-renames duplicate slide titles
- **Content-filter handling** -- graceful fallback when Azure filters block medical images
- Web UI with drag-and-drop upload
- REST API for programmatic access
- CLI for batch processing

## Quick Start (Docker Compose)

1. Copy `.env.example` to `.env` and add your API key:
   ```bash
   cp .env.example .env
   # Edit .env -- set OPENAI_API_KEY or AZURE_OPENAI_API_KEY
   ```

2. Start the services:
   ```bash
   docker compose up --build
   ```

3. Open the Web UI at **http://localhost** and upload a `.pptx` file.

## Manual Setup

```bash
cd api
pip install -e .

# Set your API key
export OPENAI_API_KEY=sk-...
# Or for Azure:
# export AZURE_OPENAI_API_KEY=...
# export AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/

# Disable auth for local use
export AUTH_DISABLED=1

# Start the API server
python docker_start.py
```

The API will be available at `http://localhost:8001`.

## CLI Usage

```bash
cd api
pip install -e .
export OPENAI_API_KEY=sk-...

pptx-alttext-v2 process input.pptx -o output.pptx
```

## API Reference

| Endpoint | Method | Description |
|---|---|---|
| `/health` | GET | Health check |
| `/config` | GET | Current configuration (no secrets) |
| `/process` | POST | Process file, returns ZIP with enhanced PPTX + report |
| `/process-powerpoint-fast` | POST | Fast mode, returns JSON with base64 file + markdown report |
| `/score` | POST | Accessibility score without modification |
| `/progress/{task_id}` | GET | Poll processing progress |

### Process a file (curl)

```bash
curl -X POST http://localhost:8001/process-powerpoint-fast \
  -F "file=@presentation.pptx" \
  -F "skip_text_boxes=true"
```

## Configuration

Configuration is loaded from (in order of priority):

1. Environment variables
2. `config.toml` in the working directory
3. `api/powerpoint_alttext_v2/config/default.toml`

Key environment variables:

| Variable | Description |
|---|---|
| `OPENAI_API_KEY` | Standard OpenAI API key |
| `AZURE_OPENAI_API_KEY` | Azure OpenAI API key |
| `AZURE_OPENAI_ENDPOINT` | Azure OpenAI endpoint URL |
| `AUTH_DISABLED` | Set to `1` to disable authentication |
| `PROCESSING_FORCE_REGENERATE` | Re-generate alt-text even if it exists |
| `PROCESSING_ENABLE_MULTITHREADING` | Enable concurrent API calls (default: true) |

See `api/powerpoint_alttext_v2/config/default.toml` for the full configuration reference.

## Authentication

Auth is **disabled by default**. To enable OIDC authentication, see
[docs/authentication.md](docs/authentication.md).

## Architecture

```
api/
  powerpoint_alttext_v2/
    core/processor.py        # Main processing engine
    core/accessibility_scorer.py
    api/server.py            # FastAPI endpoints
    config/                  # TOML-based configuration
    cli.py                   # CLI interface
webui/
  index.html, app.js, auth.js  # Vanilla JS SPA
  server.py                    # Simple Python HTTP server
docker-compose.yml
```

## Running Tests

```bash
cd api
pip install -e ".[dev]"
AUTH_DISABLED=1 pytest tests/unit/ -v
```

## License

MIT
