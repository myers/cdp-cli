# Chrome DevTools CLI

Command-line interface for Chrome DevTools Protocol (CDP), optimized for LLM agents with NDJSON output format.

## Overview

`cdp-cli` provides CLI access to all Chrome DevTools Protocol features, making it easy to automate browser interactions, debug web applications, and inspect network traffic - all from the command line with grep/tail-friendly output.

## Installation

```bash
# Local installation
cd chrome-devtools-cli
npm install
npm run build

# Global installation (coming soon)
npm install -g chrome-devtools-cli
```

## Prerequisites

Chrome must be running with remote debugging enabled:

```bash
# macOS
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222

# Linux
google-chrome --remote-debugging-port=9222

# Windows
chrome.exe --remote-debugging-port=9222
```

## Quick Start

```bash
# List all open pages
cdp-cli tabs

# Navigate to a URL
cdp-cli new "https://example.com"

# Take a screenshot
cdp-cli screenshot "example" --output screenshot.jpg

# List console messages (collects for 0.1s)
cdp-cli console "example"

# Evaluate JavaScript
cdp-cli eval "document.title" "example"
```

## Output Format: NDJSON

All list commands output **newline-delimited JSON (NDJSON)** - one complete JSON object per line. This format is:
- **LLM-friendly**: Easy to parse programmatically
- **Grep-compatible**: Filter with standard Unix tools
- **Streamable**: Handle large datasets incrementally

### Example NDJSON Output

```bash
$ cdp-cli tabs
{"id":"A1B2C3","title":"GitHub","url":"https://github.com","type":"page"}
{"id":"D4E5F6","title":"Google","url":"https://google.com","type":"page"}

$ cdp-cli console "example"
{"type":"log","timestamp":1698234567890,"text":"Page loaded","source":"console-api"}
{"type":"error","timestamp":1698234568123,"text":"TypeError: Cannot read...","source":"exception","line":42,"url":"https://example.com/app.js"}

$ cdp-cli network "example" | grep '"type":"fetch"'
{"url":"https://api.example.com/data","method":"GET","status":200,"type":"fetch","size":4567}
```

## Commands

### Page Management

**tabs** - List all open browser pages
```bash
cdp-cli tabs
```

**new** - Create a new page/tab
```bash
cdp-cli new "https://example.com"
cdp-cli new  # Empty page
```

**go** - Navigate page (URL, back, forward, reload)
```bash
cdp-cli go "https://github.com" "example"
cdp-cli go back "example"
cdp-cli go forward "example"
cdp-cli go reload "example"
```

**close** - Close a page
```bash
cdp-cli close "example"
cdp-cli close A1B2C3
```

### Debugging

**console** - List console messages (minimal output by default, optimized for LLM token savings)
```bash
# Minimal output (bare strings, last 10 messages)
cdp-cli console "example"
"Page loaded"
"API call successful"

# Show more messages
cdp-cli console "example" --tail 50

# Show all messages (no limit)
cdp-cli console "example" --all
# or
cdp-cli console "example" --tail -1

# Note: When truncated, stderr shows: "(N messages skipped. Use --tail M or --all to see more)"
# This warning is visible to both humans and LLM agents

# Include message type (switches to object format)
cdp-cli console "example" --with-type
{"text":"Page loaded","type":"log","source":"console-api"}
{"text":"Error: failed","type":"error","source":"exception","line":42,"url":"app.js"}

# Include timestamp
cdp-cli console "example" --with-timestamp
{"text":"Page loaded","timestamp":1698234567890}

# Include source location (url, line number for exceptions)
cdp-cli console "example" --with-source
{"text":"Error: undefined","url":"https://example.com/app.js","line":42}

# Verbose mode - all fields (shortcut for all three flags)
cdp-cli console "example" --verbose
# or
cdp-cli console "example" -v
{"text":"Error: undefined","type":"error","source":"exception","timestamp":1698234567890,"url":"app.js","line":42}

# Filter by type (still outputs bare strings by default)
cdp-cli console "example" --type error

# Collect for longer duration (2 seconds)
cdp-cli console "example" --duration 2
```

**snapshot** - Get page content snapshot
```bash
# Text content (default)
cdp-cli snapshot "example"

# DOM tree (JSON)
cdp-cli snapshot "example" --format dom

# Accessibility tree (JSON) - great for LLM element identification!
cdp-cli snapshot "example" --format ax
```

**eval** - Evaluate JavaScript expression
```bash
cdp-cli eval "document.title" "example"
cdp-cli eval "window.location.href" "example"
cdp-cli eval "Array.from(document.querySelectorAll('h1')).map(h => h.textContent)" "example"
```

**screenshot** - Take a screenshot
```bash
# Save to file
cdp-cli screenshot "example" --output screenshot.jpg

# Different formats
cdp-cli screenshot "example" --output screenshot.png --format png

# Output base64 (NDJSON)
cdp-cli screenshot "example"
```

### Network Inspection

**network** - List network requests (collects for 0.1s by default)
```bash
# Collect requests (default 0.1 seconds)
cdp-cli network "example"

# Collect for longer duration (5 seconds)
cdp-cli network "example" --duration 5

# Filter by type
cdp-cli network "example" --type fetch
cdp-cli network "example" --type xhr

# Combine duration and filtering
cdp-cli network "example" --duration 5 --type fetch
```

### Input Automation

**click** - Click an element by CSS selector
```bash
cdp-cli click "button#submit" "example"
cdp-cli click "a.link" "example" --double
```

**fill** - Fill an input element
```bash
cdp-cli fill "input#email" "user@example.com" "example"
cdp-cli fill "input[name='password']" "secret123" "example"
```

**key** - Press a keyboard key
```bash
cdp-cli key enter "example"
cdp-cli key tab "example"
cdp-cli key escape "example"
```

## LLM Usage Patterns

### Pattern 1: Inspect and Interact

```bash
# 1. List pages to find target
cdp-cli tabs | grep "example"

# 2. Get accessibility tree to understand page structure
cdp-cli snapshot "example" --format ax > page-structure.json

# 3. Parse structure (LLM can identify element selectors)
# 4. Interact with elements
cdp-cli fill "input#search" "query" "example"
cdp-cli click "button[type='submit']" "example"

# 5. Capture result
cdp-cli screenshot "example" --output result.jpg
```

### Pattern 2: Debug Web Application

```bash
# 1. Navigate to app
cdp-cli new "http://localhost:3000"

# 2. Monitor console for errors (increase duration for continuous monitoring)
cdp-cli console "localhost" --duration 10 --type error

# 3. Inspect failed network requests
cdp-cli network "localhost" --duration 5 | grep '"status":4'
```

### Pattern 3: Automated Testing

```bash
# 1. Open test page
cdp-cli new "http://localhost:8080/test.html"

# 2. Fill form
cdp-cli fill "input#username" "testuser" "test"
cdp-cli fill "input#password" "testpass" "test"
cdp-cli click "button#login" "test"

# 3. Wait and verify
sleep 2
cdp-cli eval "document.querySelector('.success-message')?.textContent" "test"

# 4. Capture evidence
cdp-cli screenshot "test" --output test-result.jpg
```

### Pattern 4: Data Extraction

```bash
# 1. Navigate to page
cdp-cli go "https://example.com/data" "example"

# 2. Extract data via JavaScript
cdp-cli eval "Array.from(document.querySelectorAll('.item')).map(el => ({
  title: el.querySelector('.title').textContent,
  price: el.querySelector('.price').textContent
}))" "example"
```

## Global Options

- `--cdp-url <url>` - Chrome DevTools Protocol URL (default: `http://localhost:9222`)
- `--help` - Show help
- `--version` - Show version

## Tips for LLM Agents

1. **Use NDJSON parsing**: Each line is a complete JSON object
   ```javascript
   const lines = output.split('\n').filter(l => l.trim());
   const objects = lines.map(l => JSON.parse(l));
   ```

2. **Leverage grep for filtering**:
   ```bash
   cdp-cli network "example" | grep '"status":404'
   cdp-cli console "example" | grep error
   ```

3. **Use accessibility tree for element discovery**:
   ```bash
   cdp-cli snapshot "example" --format ax
   # Parse to find elements by role, name, etc.
   # Then construct CSS selectors for click/fill
   ```

4. **Chain commands with Unix tools**:
   ```bash
   cdp-cli tabs | jq -r '.title'
   cdp-cli console "example" | grep error | tail -5
   ```

5. **Error handling**: All errors output NDJSON with `"error": true`
   ```json
   {"error":true,"message":"Page not found: example","code":"PAGE_NOT_FOUND"}
   ```

## Architecture

Built with:
- **TypeScript** - Type-safe code
- **yargs** - CLI argument parsing
- **ws** - WebSocket for CDP communication
- **NDJSON** - LLM-friendly output format

Reuses battle-tested CDP logic from [chrome-devtools-mcp](../chrome-devtools-mcp).

## Testing

This project includes a comprehensive test suite using Vitest.

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode (auto-rerun on file changes)
npm run test:watch

# Run tests with coverage report
npm run test:coverage

# Run tests with interactive UI
npm run test:ui
```

### Test Structure

```
tests/
├── fixtures/          # Sample CDP responses and test data
│   └── cdp-responses.ts
├── mocks/             # Mock implementations
│   ├── websocket.mock.ts   # WebSocket mock for CDP
│   └── fetch.mock.ts       # Fetch mock for REST API
├── helpers.ts         # Test utilities
├── setup.ts           # Test environment setup
└── unit/              # Unit tests
    ├── output.test.ts       # Output formatting tests
    ├── context.test.ts      # CDPContext tests
    └── commands/            # Command tests
        ├── pages.test.ts
        ├── debug.test.ts
        ├── network.test.ts
        └── input.test.ts
```

### Test Coverage

Current coverage:
- **Output formatting**: 100% (10 tests)
- **CDPContext**: ~95% (23 tests)
- **Pages commands**: ~90% (11 tests)
- **Overall**: 80%+ lines, functions, and statements

### Writing New Tests

Tests use mocked WebSocket and fetch, so **no running Chrome instance is required**:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { CDPContext } from '../src/context.js';
import { installMockFetch } from './mocks/fetch.mock.js';

describe('My Test', () => {
  beforeEach(() => {
    installMockFetch(); // Mock CDP REST API
  });

  it('should test something', async () => {
    const context = new CDPContext();
    const pages = await context.getPages();
    expect(pages).toHaveLength(3);
  });
});
```

### Continuous Integration

Tests run automatically on every commit and pull request (if CI is configured).

## License

MIT

## Related Projects

- [chrome-devtools-mcp](../chrome-devtools-mcp) - MCP server for Chrome DevTools
- [quest-devtools.mjs](../quest-devtools.mjs) - Simple CDP CLI prototype

---

**Built for LLM agents** - Every command outputs structured, parseable, grep-friendly data.
