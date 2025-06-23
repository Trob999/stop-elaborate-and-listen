// --- Load config.json ---
let extensionConfig = {};
fetch(chrome.runtime.getURL('config.json'))
  .then(r => r.json())
  .then(cfg => {
    extensionConfig = cfg;
    // Start everything after config is loaded
    main();
  });

function main() {
  let lastCaption = "";
  let captionHistory = [];

  function matchesShortcut(e, shortcutStr) {
    if (!shortcutStr) return false;
    const parts = shortcutStr.toLowerCase().split("+");
    let key = parts.pop();
    // Normalize key names
    if (key === "space") key = " ";
    return (
      (parts.includes("ctrl") === e.ctrlKey) &&
      (parts.includes("shift") === e.shiftKey) &&
      (parts.includes("alt") === e.altKey) &&
      (parts.includes("meta") === e.metaKey) &&
      (
        e.key.toLowerCase() === key ||
        e.code.toLowerCase().includes(key.replace(" ", "space"))
      )
    );
  }

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

          // Keep only last N seconds
          captionHistory = captionHistory.filter(c => now - c.timestamp < (extensionConfig.caption?.maxSeconds || 20) * 1000);
        }
      }
    }, extensionConfig.caption?.pollingIntervalMs || 500);
  }

  function pollCaptionsOnce() {
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

        // Keep only last N seconds
        captionHistory = captionHistory.filter(c => now - c.timestamp < (extensionConfig.caption?.maxSeconds || 20) * 1000);
      }
    }
  }

  function getRecentTranscript() {
    if (captionHistory.length === 0) return { text: "", range: "" };

    const now = Date.now();
    const transcriptChunks = captionHistory.map(c => c.text);
    const trimmedText = trimTranscript(transcriptChunks.join(" "), extensionConfig.caption?.maxWords ? extensionConfig.caption.maxWords * 8 : 500); // crude word->char
    const oldest = captionHistory[0].timestamp;
    const range = formatTimeRange(oldest, now);

    return { text: trimmedText, range };
  }

  function trimTranscript(text, maxChars) {
    if (text.length <= maxChars) return text;
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

  // --- Extract YouTube metadata ---
  function getYouTubeMetadata() {
    // Title
    let title = document.title.replace(" - YouTube", "");
    const h1 = document.querySelector('h1.title, h1.ytd-watch-metadata');
    if (h1 && h1.textContent.trim()) title = h1.textContent.trim();

    // Description
    let description = "";
    const descEl = document.querySelector('#description, #description-inline-expander, .ytd-video-secondary-info-renderer #description');
    if (descEl) {
      description = descEl.textContent.trim();
    } else {
      // Try meta tag as fallback
      const metaDesc = document.querySelector('meta[name="description"]');
      if (metaDesc) description = metaDesc.getAttribute('content') || "";
    }

    // Hashtags (from description or above title)
    let hashtags = [];
    // Try above-title hashtags
    document.querySelectorAll('a[href^="/hashtag/"]').forEach(a => {
      if (a.textContent.startsWith('#')) hashtags.push(a.textContent.trim());
    });
    // Fallback: parse hashtags from description
    if (hashtags.length === 0 && description) {
      hashtags = (description.match(/#[\w-]+/g) || []);
    }

    // Channel name
    let channel = "";
    const channelEl = document.querySelector('ytd-channel-name a, #channel-name a, .ytd-channel-name a');
    if (channelEl) channel = channelEl.textContent.trim();

    return {
      video_title: title,
      video_description: description,
      hashtags: hashtags.join(' '),
      channel_name: channel
    };
  }

  function sendToLLM(transcript, isInitial = true) {
    let systemPrompt = extensionConfig.prompts?.initial || "";
    let meta = {};

    if (isInitial) {
      meta = getYouTubeMetadata();
      // Replace placeholders in the prompt with actual metadata
      systemPrompt = systemPrompt
        .replace("{video_title}", meta.video_title || "")
        .replace("{video_description}", meta.video_description || "")
        .replace("{hashtags}", meta.hashtags || "")
        .replace("{channel_name}", meta.channel_name || "");
    }

    const payload = {
      transcript: transcript,
      systemPrompt: systemPrompt,
    };

    return fetch(
      extensionConfig.web_extension?.llm_url || "http://localhost:8080/api/ask",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }
    ).then(res => res.json());
  }
  let conversationHistory = [];

  function showOverlay(initialText, transcript) {
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
          top: 5%;
          left: 50%;
          transform: translateX(-50%);
          width: ${extensionConfig.overlay?.width || 800}px;
          background: ${extensionConfig.ui?.overlayBackground || "rgba(0,0,0,0.95)"};
          color: white;
          padding: ${extensionConfig.overlay?.padding || 32}px;
          z-index: 9999;
          font-family: sans-serif;
          display: flex;
          flex-direction: column;
          border-radius: ${extensionConfig.overlay?.borderRadius || 14}px;
          max-height: ${extensionConfig.overlay?.maxHeightPercent || 80}%;
          box-shadow: 0 8px 32px rgba(0,0,0,0.4);
          font-size: ${extensionConfig.ui?.fontSize || 20}px;
        }
        #elaborator-response {
          display: flex;
          flex-direction: column;
          flex-grow: 1;
          overflow-y: auto;
        }
        #elaborator-overlay .message {
          padding: 16px;
          border-radius: 10px;
          margin-bottom: 14px;
          white-space: pre-wrap;
          width: fit-content;
          min-width: 0;
          max-width: 75%;
          font-size: ${extensionConfig.ui?.fontSize || 18}px;
          word-break: break-word;
          box-sizing: border-box;
          display: block;
        }
        #elaborator-overlay .user {
          background: ${extensionConfig.ui?.userBubbleColor || "#1db954"};
          color: ${extensionConfig.ui?.userTextColor || "#fff"};
          align-self: flex-end;
          text-align: right;
          box-shadow: 0 2px 8px rgba(29,185,84,0.15);
        }
        #elaborator-overlay .assistant {
          background: ${extensionConfig.ui?.assistantBubbleColor || "#333"};
          color: ${extensionConfig.ui?.assistantTextColor || "#fff"};
          align-self: flex-start;
          text-align: left;
          box-shadow: 0 2px 8px rgba(0,0,0,0.15);
        }
        #elaborator-overlay .system-banner {
          background: ${extensionConfig.ui?.systemBannerColor || "#1976d2"};
          color: ${extensionConfig.ui?.systemBannerTextColor || "#fff"};
          border-radius: 10px;
          margin-bottom: 18px;
          padding: 18px 24px;
          font-size: ${extensionConfig.ui?.fontSize || 18}px;
          font-weight: normal;
          text-align: left;
          align-self: center;
          width: 100%;
          max-width: 100%;
          box-sizing: border-box;
          display: block;
        }
        #elaborator-input-wrapper {
          display: flex;
          gap: 10px;
          margin-top: 18px;
        }
        #elaborator-input {
          flex-grow: 1;
          padding: 14px;
          border-radius: 6px;
          border: none;
          font-size: ${extensionConfig.ui?.fontSize || 18}px;
        }
        #elaborator-send {
          padding: 14px 22px;
          background: ${extensionConfig.ui?.sendButtonColor || extensionConfig.ui?.userBubbleColor || "#1db954"};
          color: white;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: ${extensionConfig.ui?.fontSize || 18}px;
        }
        #elaborator-loading {
          margin-bottom: 12px;
          font-style: italic;
          color: #ccc;
          display: none;
          font-size: ${extensionConfig.ui?.fontSize || 18}px;
        }
        #elaborator-close {
          position: absolute;
          top: 18px;
          right: 24px;
          background: transparent;
          color: white;
          font-size: 28px;
          border: none;
          cursor: pointer;
        }
        .elaborator-kaomoji {
          font-size: 2em;
          text-align: center;
          margin: 16px auto;
          display: block;
          animation: kaomoji-dance 0.6s infinite alternate;
        }

        @keyframes kaomoji-dance {
          0%   { transform: translateY(0) rotate(-5deg);}
          50%  { transform: translateY(-10px) rotate(5deg);}
          100% { transform: translateY(0) rotate(-5deg);}
        }

        /* Add to your <style> block or stylesheet */
        .inline-code-wrapper .copy-inline-code:hover {
          opacity: 1 !important;
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
    closeBtn.onclick = () => {
      overlay.remove();
      document.removeEventListener("keydown", escListener);
    };
    overlay.appendChild(closeBtn);

    // Response container
    const responseDiv = document.createElement("div");
    responseDiv.id = "elaborator-response";
    overlay.appendChild(responseDiv);

    // Loading indicator
    const loadingDiv = document.createElement("div");
    loadingDiv.id = "elaborator-loading";
    loadingDiv.style.display = "none"; // Hide by default
    overlay.appendChild(loadingDiv);

    loadingDiv.style.display = "none"; // Hide by default

    // Helper for bubbles
    function appendBubble(text, who) {
      const bubble = document.createElement("div");
      bubble.classList.add("message", who);

      // Simple Markdown replacements for bold and inline code
      function md(text) {
        // Bold: **text**
        text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        // Inline code: `code`
        text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
        return text;
      }

      // Split by lines for smarter list handling
      const lines = text.split('\n');
      let html = '';
      let inList = false;

      for (let line of lines) {
        // Bullet or numbered list
        if (/^\s*([\*\-]|\d+\.)\s+/.test(line)) {
          if (!inList) {
            html += '<ul style="margin: 0 0 0 1.5em; padding: 0;">';
            inList = true;
          }
          // Remove bullet/number and wrap in <li>
          html += `<li>${md(line.replace(/^\s*([\*\-]|\d+\.)\s+/, ''))}</li>`;
        } else {
          if (inList) {
            html += '</ul>';
            inList = false;
          }
          // Regular paragraph
          if (line.trim()) html += `<p>${md(line)}</p>`;
        }
      }
      if (inList) html += '</ul>';

      bubble.innerHTML = html;
      responseDiv.appendChild(bubble);

      // Add copy-to-clipboard for inline code
      bubble.querySelectorAll('.copy-inline-code').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          const code = btn.parentElement.querySelector('code').innerText;
          navigator.clipboard.writeText(code);
          btn.innerText = "✅";
          setTimeout(() => { btn.innerText = "📋"; }, 1000);
        });
      });

      // Add copy-to-clipboard for multiline code blocks
      bubble.querySelectorAll('.copy-multiline-code').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          const code = btn.parentElement.querySelector('code').innerText;
          navigator.clipboard.writeText(code);
          btn.innerText = "✅";
          setTimeout(() => { btn.innerText = "📋"; }, 1000);
        });
      });
    }

    // Show the system prompt as a blue, full-width banner ONLY if enabled in config
    if (extensionConfig.overlay?.showInitialMessage !== false) {
      const systemBanner = document.createElement("div");
      systemBanner.className = "system-banner";
      systemBanner.innerText = transcript; // transcript is your full prompt
      responseDiv.appendChild(systemBanner);
    }

    // Show the assistant's reply (on the right)
    appendBubble(initialText, "assistant");
    conversationHistory.push(`Assistant: ${initialText}`);

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

      setTimeout(() => {
        responseDiv.scrollTop = responseDiv.scrollHeight;
      }, 0);

      // --- Spinner logic: show and start spinner only while waiting ---
      const brailleFrames = ["⠋","⠙","⠹","⠸","⠼","⠴","⠦","⠧","⠇","⠏"];
      let brailleIndex = 0;
      loadingDiv.innerHTML = `<span id="braille-spinner">${brailleFrames[0]}</span> <span style="margin-left:8px;"></span>`;
      loadingDiv.style.display = "block";

      let spinnerInterval = setInterval(() => {
        brailleIndex = (brailleIndex + 1) % brailleFrames.length;
        const spinner = document.getElementById("braille-spinner");
        if (spinner) spinner.textContent = brailleFrames[brailleIndex];
      }, 80);

      const payload = {
        transcript: conversationHistory.join("\n\n"),
        systemPrompt: "", // Let backend use config.yaml default
      };

      try {
        const res = await fetch(
          extensionConfig.web_extension?.llm_url || "http://localhost:8080/api/ask",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          }
        );
        const data = await res.json();
        const reply = data.response || `[Error: ${data.error || "No response"}]`;
        appendBubble(reply, "assistant");
        conversationHistory.push(`Assistant: ${reply}`);
      } catch (err) {
        appendBubble(`Fetch Error: ${err.message}`, "assistant");
      } finally {
        clearInterval(spinnerInterval);
        loadingDiv.style.display = "none";
        responseDiv.scrollTop = responseDiv.scrollHeight;
      }
    }

    sendBtn.addEventListener("click", handleSend);
    input.addEventListener("keydown", e => {
      if (e.key === "Enter" && input.value.trim()) handleSend();
    });

    // Allow closing overlay with Escape key
    function escListener(e) {
      if (e.key === "Escape") {
        overlay.remove();
        document.removeEventListener("keydown", escListener);
      }
    }
    document.addEventListener("keydown", escListener);
  }

  function pauseVideo() {
    const video = document.querySelector("video");
    if (video && !video.paused) {
      video.pause();
    }
  }

  let lastTap = 0;
  let blockNextSpaceUp = false;

  document.addEventListener("keydown", async e => {
    const shortcut = extensionConfig.shortcuts?.activateChat;
    if (matchesShortcut(e, shortcut)) {
      e.preventDefault();
      pauseVideo();

      let polls = 0;
      const maxPolls = 6;
      const pollInterval = 250;

      async function pollAndSend() {
        pollCaptionsOnce();
        polls++;
        if (polls < maxPolls) {
          setTimeout(pollAndSend, pollInterval);
        } else {
          const captionNodes = Array.from(document.querySelectorAll('.ytp-caption-segment'));
          let { text: transcript, range } = getRecentTranscript();

          if (captionNodes.length > 0) {
            // Get the newest (bottom-most) caption line
            const newestLine = captionNodes[captionNodes.length - 1].innerText.trim();
            if (newestLine && !transcript.endsWith(newestLine)) {
              transcript = transcript + " " + newestLine;
            }
          }

          const meta = getYouTubeMetadata();
          const systemPromptTemplate = extensionConfig.prompts?.initial || "";
          const systemPrompt = systemPromptTemplate
            .replace("{video_title}", meta.video_title || "")
            .replace("{video_description}", meta.video_description || "")
            .replace("{hashtags}", meta.hashtags || "")
            .replace("{channel_name}", meta.channel_name || "");
          const fullPrompt = `System prompt: ${systemPrompt}\n\nTranscript:\n${transcript}`;

          const result = await sendToLLM(transcript, true);
          showOverlay(result.response, fullPrompt);
        }
      }
      pollAndSend();
      return;
    }

    if (e.code !== "Space") return;

    const tag = e.target.tagName.toLowerCase();
    const isEditable = e.target.isContentEditable;

    // Ignore if focus is in an <input>, <textarea>, or contenteditable
    if (tag === "input" || tag === "textarea" || isEditable) {
      return;
    }

    const now = Date.now();
    if (now - lastTap < 400) {
      // Double-tap detected
      e.preventDefault();
      e.stopImmediatePropagation();
      blockNextSpaceUp = true;

      pauseVideo();

      let polls = 0;
      const maxPolls = 6;
      const pollInterval = 250;

      async function pollAndSend() {
        pollCaptionsOnce();
        polls++;
        if (polls < maxPolls) {
          setTimeout(pollAndSend, pollInterval);
        } else {
          const captionNodes = Array.from(document.querySelectorAll('.ytp-caption-segment'));
          let { text: transcript, range } = getRecentTranscript();

          if (captionNodes.length > 0) {
            // Get the newest (bottom-most) caption line
            const newestLine = captionNodes[captionNodes.length - 1].innerText.trim();
            if (newestLine && !transcript.endsWith(newestLine)) {
              transcript = transcript + " " + newestLine;
            }
          }

          const meta = getYouTubeMetadata();
          const systemPromptTemplate = extensionConfig.prompts?.initial || "";
          const systemPrompt = systemPromptTemplate
            .replace("{video_title}", meta.video_title || "")
            .replace("{video_description}", meta.video_description || "")
            .replace("{hashtags}", meta.hashtags || "")
            .replace("{channel_name}", meta.channel_name || "");
          const fullPrompt = `System prompt: ${systemPrompt}\n\nTranscript:\n${transcript}`;

          const result = await sendToLLM(transcript, true);
          showOverlay(result.response, fullPrompt);
        }
      }
      pollAndSend();
      lastTap = 0;
    } else {
      lastTap = now;
      blockNextSpaceUp = false;
    }
  }, true);

  document.addEventListener("keyup", e => {
    if (blockNextSpaceUp && e.code === "Space") {
      e.preventDefault();
      e.stopImmediatePropagation();
      blockNextSpaceUp = false;
    }
  }, true);

  function showNoCaptionsBanner() {
    // Remove existing banner if present
    const existing = document.getElementById("no-captions-banner");
    if (existing) existing.remove();

    // Create banner
    const banner = document.createElement("div");
    banner.id = "no-captions-banner";
    banner.innerHTML = `
      <span>No captions available for this video. <b>Stop, Elaborate and Listen</b> will not work.</span>
      <button id="no-captions-close" style="margin-left:16px;background:none;border:none;color:white;font-size:18px;cursor:pointer;">✖</button>
    `;
    banner.style.position = "fixed";
    banner.style.top = "0";
    banner.style.left = "0";
    banner.style.width = "100%";
    banner.style.background = "#c0392b";
    banner.style.color = "white";
    banner.style.padding = "16px";
    banner.style.zIndex = "10000";
    banner.style.display = "flex";
    banner.style.justifyContent = "center";
    banner.style.alignItems = "center";
    banner.style.fontFamily = "sans-serif";
    banner.style.boxShadow = "0 2px 8px rgba(0,0,0,0.15)";

    document.body.appendChild(banner);

    document.getElementById("no-captions-close").onclick = () => banner.remove();
  }

  function enableYouTubeCaptions() {
    let attempts = 0;
    const maxAttempts = 20;

    const interval = setInterval(() => {
      const player = document.getElementById('movie_player');
      if (player && player.classList.contains('ad-showing')) return;

      const captionsBtn = document.querySelector('.ytp-subtitles-button');
      const captionsSegment = document.querySelector('.ytp-caption-segment');

      if (captionsSegment) {
        clearInterval(interval);
        return;
      }

      if (
        captionsBtn &&
        !captionsBtn.hasAttribute('disabled') &&
        captionsBtn.getAttribute('aria-pressed') === 'false'
      ) {
        captionsBtn.click();
      }

      if (++attempts > maxAttempts) {
        clearInterval(interval);
        if (
          captionsBtn &&
          !captionsBtn.hasAttribute('disabled') &&
          !document.querySelector('.ytp-caption-segment')
        ) {
          showNoCaptionsBanner();
        }
      }
    }, 500);

    // --- AD WATCHER ---
    const player = document.getElementById('movie_player');
    if (player) {
      const adObserver = new MutationObserver(() => {
        if (!player.classList.contains('ad-showing')) {
          enableYouTubeCaptions();
          adObserver.disconnect();
        }
      });
      adObserver.observe(player, { attributes: true, attributeFilter: ['class'] });
    }
  }

  let lastVideoUrl = location.href;

  function onVideoChange() {
    enableYouTubeCaptions();
    trackCaptions();
  }

  function observeVideoChanges() {
    setInterval(() => {
      if (location.href !== lastVideoUrl) {
        lastVideoUrl = location.href;
        onVideoChange();
      }
    }, 1000);

    const player = document.getElementById('movie_player');
    if (player) {
      const observer = new MutationObserver(() => {
        if (location.href !== lastVideoUrl) {
          lastVideoUrl = location.href;
          onVideoChange();
        }
      });
      observer.observe(player, { childList: true, subtree: true });
    }
  }

  // Initial run (after config loaded)
  enableYouTubeCaptions();
  trackCaptions();
  observeVideoChanges();
}
