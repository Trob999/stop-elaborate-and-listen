package api

import (
	"encoding/json"
	"log"
	"net/http"
	"stopel/internal/llm"
	"stopel/internal/settings"
)

type AskRequest struct {
	Transcript   string `json:"transcript"`
	SystemPrompt string `json:"systemPrompt"`
}

type AskResponse struct {
	Response string `json:"response"`
}

func HandleAsk(w http.ResponseWriter, r *http.Request) {
	var req AskRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "Invalid JSON: " + err.Error(),
		})
		return
	}

	// Use default prompt from config if not provided
	systemPrompt := req.SystemPrompt
	if systemPrompt == "" {
		systemPrompt = settings.AppConfig.Prompts.Initial
	}

	respText, err := llm.AskLLM(req.Transcript, systemPrompt)
	if err != nil {
		// Log the error
		log.Printf("LLM error: %v\n", err)

		// ✅ Fallback response instead of failing outright
		respText = "⚠️ LLM unavailable. Here's the transcript you sent:\n\n" + req.Transcript
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(AskResponse{Response: respText})
}
