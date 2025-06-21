package whisper

import "errors"

// TranscribeAudio would take an audio file or stream and return text.
// You’ll wire this up later using whisper.cpp or a remote API.
func TranscribeAudio(filePath string) (string, error) {
	return "", errors.New("audio transcription not yet implemented")
}
