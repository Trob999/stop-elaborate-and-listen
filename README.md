# Stop, Elaborate, and Listen

A browser extension + local AI backend that lets you double-tap the spacebar on any YouTube video to pause playback and instantly get a contextual explanation of the last few captions, powered by a local LLM.

---

## Prerequisites

- [Go](https://go.dev/dl/) installed (`go version` should show 1.18 or higher)
- [Ollama](https://ollama.com/download) installed and running locally
- A Chromium-based browser (Chrome/Edge) or Firefox with developer mode enabled

---

## Setup Instructions

### 1. Start the Local Language Model (LLM)

This project assumes you are using **Ollama3** locally on port `11434`.

```bash
# Install the LLaMA 3 model (once only)
ollama pull llama3

# Start the model (keep this running)
ollama run llama3
```

You should see something like:

```
Ollama is running on http://localhost:11434
```

### 2. Run the Go Server

Navigate to the root of the project and start the backend:

```bash
go run ./cmd/server
```

Expected output:

```
🚀 Server listening on http://localhost:8080
```

> Ensure this server is running before using the extension.

---

## 3. Load the Extension into Your Browser

### For Chrome / Edge:

1. Go to `chrome://extensions/`
2. Enable **Developer mode** (top right toggle)
3. Click **Load unpacked**
4. Select the `web-extension/` directory in this repo

### For Firefox:

1. Navigate to `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on**
3. Select `web-extension/manifest.json`

---

## 4. Usage Instructions

1. Open a **YouTube video** and ensure **captions (CC)** are enabled.
2. Confirm both:
   - `ollama run llama3` is active (port `11434`)
   - `go run ./cmd/server` is running (port `8080`)
3. On the YouTube video, **double tap the spacebar**:
   - The video will pause
   - The overlay will pop up with an LLM-generated explanation of recent captions
4. You can:
   - Ask follow-up questions directly in the overlay
   - Press `Enter` or click **Send**
   - Click the ❌ in the top right to close the overlay
