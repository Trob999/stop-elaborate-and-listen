# Stop, Elaborate, and Listen

A browser extension + local AI backend that lets you double-tap the spacebar on any YouTube video to pause playback and instantly get a contextual explanation of the concepts outlined in the most recent sentences captured from YouTube's closed captions, powered by a local LLM.

---

## Known issues / TODO items

- **Only works with YouTube currently.**  
  **Solution:** Add functionality for other sites manually, or fallback on real-time audio transcription (e.g. [Whisper](https://github.com/openai/whisper)).

- **Some videos have closed captions fully disabled.**  
  **Solution:** Fallback to real-time transcription (e.g. Whisper).

- **Responses don't handle inline code well**  
  - *Current solution:* Inline code is now rendered with improved styling and a copy-to-clipboard button for long or multiline code snippets. Short inline code is styled for readability. This is handled in the extension's content script, but the feature is still a little buggy and may not always render perfectly.

- **Stateless LLMs can’t remember previous context.**  
  - *Current solution:* The extension resends the full transcript and conversation history for each question.
  - *Proposed redesign:*  
    - **Extension**: capture messages & captions → send to memory service  
    - **Memory Service** (Go/Python):  
      - Persist raw turns in SQLite/BoltDB  
      - Classify/tag on insert (`main_topic`, `sub_topic`, etc.)  
    - **Summarisation**: every N turns, prompt LLM for hierarchical summaries → store separately  
    - **Vector Store**: embed turns/summaries → index in Chroma/FAISS  
    - **Memory Code Generator**: emit short session codes referencing relevant IDs → persist mappings  
    - **Prompt Builder**: fetch last 2–3 raw turns, latest summary, top-K semantic hits → assemble ≤200-token prompt  
    - **Local LLM Hook**: send compact prompt to LLM → receive response  
    - **Glue Logic**: decode session codes, expand context, rotate/prune old memory  

  **Dependencies:**  
  - Chrome/Firefox Extension APIs  
  - SQLite (`github.com/mattn/go-sqlite3`)  
  - `llama.cpp` (embeddings & light LLM ops)  
  - LlamaIndex (hierarchical summarisation)  
  - Qdrant (vector store + retrieval)  
  - gRPC (`google.golang.org/grpc`) for extension↔memory-service comms  
  - Ollama CLI (local LLM runtime)

- **YouTube captions are sometimes inaccurate.**  
  **Solution:** On initial page load, send video title, description, categories (e.g. `#tech #tutorial`) plus a brief “clean-up” prompt to the LLM; store for later.

---

### ✅ Fixed items

- **Captions are not enabled by default.**  
  *Fixed:* The extension now auto-enables captions every time a YouTube page loads.

- **Recent captions may not be captured before processing.**  
  *Fixed:* The extension polls for recent captions before sending to the LLM, ensuring up-to-date context.

- **Double-tap spacebar interferes with YouTube’s default pause/play.**  
  *Fixed:* Single space = pause; double space (within timeout) = open overlay without restarting video.

- **Manual cleanup and code optimization.**  
  *Fixed:* Unused files removed and code optimized.

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
