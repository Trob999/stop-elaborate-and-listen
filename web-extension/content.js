let lastCaption = "";
let captionHistory = [];

function trackCaptions() {
  const interval = setInterval(() => {
    const captionNode = document.querySelector('.ytp-caption-segment');
    const now = Date.now();

    if (captionNode && captionNode.innerText.trim()) {
      const newText = captionNode.innerText.trim();

      // Prevent duplicates
      const last = captionHistory[captionHistory.length - 1];
      if (!last || last.text !== newText) {
        captionHistory.push({
          text: newText,
          timestamp: now
        });

        // Keep only last 20 seconds
        captionHistory = captionHistory.filter(c => now - c.timestamp < 20000);
      }
    }
  }, 500);
}

function getRecentTranscript() {
  if (captionHistory.length === 0) return { text: "", range: "" };

  const now = Date.now();
  const transcriptChunks = captionHistory.map(c => c.text);
  const trimmedText = trimTranscript(transcriptChunks.join(" "), 500); // limit to 500 characters
  const oldest = captionHistory[0].timestamp;
  const range = formatTimeRange(oldest, now);

  return { text: trimmedText, range };
}

function trimTranscript(text, maxChars) {
  if (text.length <= maxChars) return text;

  // Trim from the front (keep the most recent end of the caption)
  return "..." + text.slice(text.length - maxChars);
}

function formatTimeRange(startMs, endMs) {
  const sec = t => Math.floor(t / 1000);
  const pad = n => String(n).padStart(2, '0');

  const format = ms => {
    const s = sec(ms);
    return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
  };

  return `${format(startMs)} → ${format(endMs)}`;
}

function sendToLLM(transcript) {
  const payload = {
    transcript: transcript,
    systemPrompt: "You are an AI assistant that provides detailed explanations and summaries based on the provided transcript. Your responses should be informative, concise, and relevant to the content of the transcript.",
  };

  return fetch("http://localhost:8080/api/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  }).then(res => res.json());
}
let conversationHistory = [];

function showOverlay(initialText) {
  // Remove old overlay if it exists
  const existing = document.getElementById("elaborator-overlay");
  if (existing) existing.remove();

  // Inject bubble CSS (only once)
  if (!document.getElementById("elaborator-styles")) {
    const style = document.createElement("style");
    style.id = "elaborator-styles";
    style.textContent = `
      #elaborator-overlay {
        position: fixed;
        top: 10%;
        left: 50%;
        transform: translateX(-50%);
        width: 600px;
        background: rgba(0,0,0,0.9);
        color: white;
        padding: 20px;
        z-index: 9999;
        font-family: sans-serif;
        display: flex;
        flex-direction: column;
        border-radius: 8px;
        max-height: 60%;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      }
      #elaborator-overlay .message {
        padding: 10px;
        border-radius: 6px;
        margin-bottom: 8px;
        white-space: pre-wrap;
        max-width: 80%;
      }
      #elaborator-overlay .user {
        background: #e0e0e0;
        color: #000;
        align-self: flex-end;
      }
      #elaborator-overlay .assistant {
        background: #333;
        color: #fff;
        align-self: flex-start;
      }
      #elaborator-input-wrapper {
        display: flex;
        gap: 6px;
      }
      #elaborator-input {
        flex-grow: 1;
        padding: 8px;
        border-radius: 4px;
        border: none;
      }
      #elaborator-send {
        padding: 8px 12px;
        background: #1db954;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
      }
      #elaborator-loading {
        margin-bottom: 8px;
        font-style: italic;
        color: #ccc;
        display: none;
      }
      #elaborator-close {
        position: absolute;
        top: 10px;
        right: 14px;
        background: transparent;
        color: white;
        font-size: 18px;
        border: none;
        cursor: pointer;
      }
    `;
    document.head.appendChild(style);
  }

  // Create overlay
  const overlay = document.createElement("div");
  overlay.id = "elaborator-overlay";

  // Close button
  const closeBtn = document.createElement("button");
  closeBtn.id = "elaborator-close";
  closeBtn.innerText = "✖";
  closeBtn.onclick = () => overlay.remove();
  overlay.appendChild(closeBtn);

  // Response container
  const responseDiv = document.createElement("div");
  responseDiv.id = "elaborator-response";
  responseDiv.style.flexGrow = "1";
  responseDiv.style.overflowY = "auto";
  overlay.appendChild(responseDiv);

  // Loading indicator
  const loadingDiv = document.createElement("div");
  loadingDiv.id = "elaborator-loading";
  loadingDiv.innerText = "Assistant is typing...";
  overlay.appendChild(loadingDiv);

  // Helper for bubbles
  function appendBubble(text, who) {
    const bubble = document.createElement("div");
    bubble.classList.add("message", who);
    bubble.innerText = text;
    responseDiv.appendChild(bubble);
  }

  // Show the initial assistant message
  appendBubble(initialText, "assistant");
  conversationHistory = [`Assistant: ${initialText}`];

  // Input area
  const inputWrapper = document.createElement("div");
  inputWrapper.id = "elaborator-input-wrapper";

  const input = document.createElement("input");
  input.id = "elaborator-input";
  input.type = "text";
  input.placeholder = "Ask a follow-up...";
  inputWrapper.appendChild(input);

  const sendBtn = document.createElement("button");
  sendBtn.id = "elaborator-send";
  sendBtn.innerText = "Send";
  inputWrapper.appendChild(sendBtn);

  overlay.appendChild(inputWrapper);
  document.body.appendChild(overlay);

  input.focus();

  // Send handler
  async function handleSend() {
    const userMsg = input.value.trim();
    if (!userMsg) return;

    appendBubble(userMsg, "user");
    conversationHistory.push(`You: ${userMsg}`);
    input.value = "";

    loadingDiv.style.display = "block";

    const payload = {
      transcript: conversationHistory.join("\n\n"),
      systemPrompt: "You are continuing a helpful, context-aware conversation with the user.",
    };

    try {
      const res = await fetch("http://localhost:8080/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      const reply = data.response || `[Error: ${data.error || "No response"}]`;
      appendBubble(reply, "assistant");
      conversationHistory.push(`Assistant: ${reply}`);
    } catch (err) {
      appendBubble(`Fetch Error: ${err.message}`, "assistant");
    } finally {
      loadingDiv.style.display = "none";
      responseDiv.scrollTop = responseDiv.scrollHeight;
    }
  }

  sendBtn.addEventListener("click", handleSend);
  input.addEventListener("keydown", e => {
    if (e.key === "Enter" && input.value.trim()) handleSend();
  });
}


function pauseVideo() {
  const video = document.querySelector("video");
  if (video && !video.paused) {
    video.pause();
  }
}

let lastTap = 0;

document.addEventListener("keydown", async e => {
  // only care about spacebar
  if (e.code !== "Space") return;

  const tag = e.target.tagName.toLowerCase();
  const isEditable = e.target.isContentEditable;

  // 1) If focus is in an <input>, <textarea> or contenteditable, 
  //    stop YouTube's toggle but let the space go through to the textbox.
  if (tag === "input" || tag === "textarea" || isEditable) {
    e.stopPropagation();
    return;
  }

  // 2) Otherwise handle double-tap
  const now = Date.now();
  if (now - lastTap < 400) {
    // prevent YouTube from toggling play/pause
    e.preventDefault();
    e.stopPropagation();

    // your existing logic
    pauseVideo();
    const { text: transcript, range } = getRecentTranscript();
    console.log("📝 Transcript ("+range+"):", transcript);
    const result = await sendToLLM(transcript);
    console.log("🧠 LLM response:", result);
    showOverlay(result.response);
  }

  lastTap = now;
});

function enableYouTubeCaptions() {
  let attempts = 0;
  const maxAttempts = 20; // Try for up to 10 seconds

  const interval = setInterval(() => {
    const captionsBtn = document.querySelector('.ytp-subtitles-button');
    const captionsSegment = document.querySelector('.ytp-caption-segment');

    // If captions are showing, stop trying
    if (captionsSegment) {
      clearInterval(interval);
      return;
    }

    // If button exists and captions are off, click it
    if (captionsBtn && captionsBtn.getAttribute('aria-pressed') === 'false') {
      captionsBtn.click();
    }

    // Stop after max attempts
    if (++attempts > maxAttempts) {
      clearInterval(interval);
      if (!document.querySelector('.ytp-caption-segment')) {
        alert("No captions available for this video.");
      }
    }
  }, 500);
}

enableYouTubeCaptions();

trackCaptions();
