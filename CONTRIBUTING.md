# Contributing

Thank you for your interest in contributing!

## Getting Started

1. Fork the repository
2. Create a feature branch: `git checkout -b my-feature`
3. Make your changes
4. Run the tests: `cd api && AUTH_DISABLED=1 pytest tests/unit/ -v`
5. Commit your changes: `git commit -m "Add my feature"`
6. Push to your fork: `git push origin my-feature`
7. Open a Pull Request

## Development Setup

```bash
cd api
pip install -e ".[dev]"
export AUTH_DISABLED=1
```

## Code Style

- Follow PEP 8 for Python code
- Use ASCII-safe characters in all `print()` output (no emoji) -- Windows
  cp1252 encoding crashes on non-ASCII
- Use `[OK]`, `[ERROR]`, `[WARN]`, `[INFO]` prefixes for status messages

## Tests

Run unit tests before submitting:

```bash
cd api
AUTH_DISABLED=1 pytest tests/unit/ -v
```
