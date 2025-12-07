# Frequently Asked Questions

## General Questions

### What is Idun Agent Platform?

Idun Agent Platform is a comprehensive framework for building and managing AI agents across multiple frameworks.

### Which frameworks are supported?

The platform currently supports Haystack, LangGraph, and additional frameworks through plugins.

### Is it open source?

Information about licensing and open source status.

## Technical Questions

### How do I deploy to production?

See the Deployment section for detailed production deployment guides.

### Can I use custom agent frameworks?

The platform supports custom framework integration through the adapter system.

### What are the system requirements?

Minimum and recommended system specifications for running the platform.

## Troubleshooting

### Common issues and their solutions

Frequently encountered problems and how to resolve them.

#### NotADirectoryError with jsonschema_specifications

**Error**: `NotADirectoryError: [Errno 20] Not a directory: '.../jsonschema_specifications/schemas/Icon\r'`

**Cause**: This error occurs when the `jsonschema_specifications` package installation is corrupted, typically due to macOS resource fork files (like `Icon\r`) being incorrectly created in the package directory.

**Solution**: Remove the corrupted file and reinstall the package:

```bash
# Option 1: Remove the corrupted file and reinstall jsonschema_specifications
rm -rf .venv/lib/python3.12/site-packages/jsonschema_specifications/schemas/Icon*
pip install --force-reinstall --no-cache-dir jsonschema-specifications

# Option 2: Reinstall all dependencies (recommended)
pip install --force-reinstall --no-cache-dir idun-agent-engine

# Option 3: Recreate the virtual environment (most thorough)
deactivate  # if venv is activated
rm -rf .venv
python3.12 -m venv .venv
source .venv/bin/activate
pip install idun-agent-engine
```

**Prevention**: If using macOS, ensure your package manager handles resource forks correctly. Consider using `uv` instead of `pip` for better macOS compatibility.
