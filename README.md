# Stop, Elaborate, and Listen

A browser extension + local AI backend that lets you double-tap the spacebar on any YouTube video to pause playback and instantly get a contextual explanation of the concepts outlined in the most recent sentences captured from Youtube's closed captions, powered by a local LLM.

---

## Known issues/TODO items:

- Only works with YouTube currently.
Solution: either selectively add functionality for other websites manually, or fallback on real time audio transcriber like Whisper https://github.com/openai/whisper

- Captions are not enabled by default.
Solution: Code in a way to enable captions automatically every time youtube page is loaded. 

- Some videos may have closed captions fully disabled (un-toggleable) by default.
Solution: potential fallback to real time transcriber like Whisper https://github.com/openai/whisper

- Most recent captions _potentially_ not captured in time before sent for processing?
Solution: Verify issue actually exists, if it does, add delay to ensure all captions up until video was paused are captured. 

- Double tap spacebar interferes with youtube's default pause/play behaviour, causing the video to keep playing. 
Solution: I really like the double tap space shortcut, so will need to find a way to have youtube ignore this behaviour while keeping it's other capabilities intact (i.e. pressing space once should still pause the video, but pressing space the 2nd time within a small enough window should NOT re-start the video and should instead open the **Stop, Elaborate and Listen** AI chat overlay.) 

- This is mostly AI slop at the moment
Solution: manual cleanup, delete unused files, optimise code. 

- API-called LLMs are stateless by default, cannot remember previous conversational question
Current solution (ugly): copy entire transcript for every new question (resource intensive, not really a solution, only implemented for MVP)
Proposed solution: Entire re-design of architecture - see below:
   **Extension:**
   Capture user messages & caption chunks
   Send each event to local memory service
   **Memory Service (Go/Python):**
   Persist raw turns in SQLite/BoltDB
   On insert, classify/tag (main_topic, sub_topic, etc.)
   **Summarisation:**
   Every N turns, prompt LLM to create hierarchical summaries
   Store summaries in their own table
   **Vector Store:**
   Embed raw turns/summaries
   Index embeddings in Chroma/FAISS for semantic retrieval
   **Memory Code Generator:**
   After each turn, emit a short session code referencing relevant IDs
   Persist code ↔ ID mappings
   **Prompt Builder:**
   Fetch: last 2–3 raw turns, latest summary, top-K semantic hits
   Assemble a ≤200-token prompt with those pieces
   **Local LLM Hook:**
   Send the compact prompt to local LLM
   Receive and return the response
   **Glue Logic:**
   Decode session codes and expand context before building prompt
   Rotate/prune old memory (raw & summaries) as needed

The above will need:
   Chrome/Firefox Extension APIs
   SQLite (via github.com/mattn/go-sqlite3)
   llama.cpp (for embeddings and light LLM ops)
   LlamaIndex (for hierarchical summarisation)
   Qdrant (vector store + semantic retrieval)
   gRPC (google.golang.org/grpc) for extension↔memory-service comms
   Ollama CLI (local LLM runtime)

- Youtube captions not always very accurate, especially if the speaker has some kind of accent
Solution: Embellish the first call to local LLM with further context pulled from Youtube page - video title + description + any youtube-embedded video categories (i.e. #tech #tutorial) + small prompt to clean up the captions and teach the LLM it's purpose ("you pass the butter"). This should be done upon initial youtube page load and immediately stored for later retrieval. 

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
