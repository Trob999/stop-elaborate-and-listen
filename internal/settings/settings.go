package settings

import (
	"os"
)

var defaultPrompt = "Please elaborate on the concept/subject/topic of what was just mentioned in the video before it was paused"

// In MVP, we'll just read this from .env or fall back to a default
func GetSystemPrompt() string {
	if prompt := os.Getenv("DEFAULT_SYSTEM_PROMPT"); prompt != "" {
		return prompt
	}
	return defaultPrompt
}
