package ccparser

import "strings"

// ExtractContext reduces long captions into a focused chunk for LLM input.
// You can customize how many seconds/words you want to include.
func ExtractContext(captions string) string {
	// Basic placeholder logic – truncate to last ~30 words
	words := strings.Fields(captions)
	if len(words) > 30 {
		words = words[len(words)-30:]
	}
	return strings.Join(words, " ")
}
