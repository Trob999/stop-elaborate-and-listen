package settings

import (
	"os"

	"gopkg.in/yaml.v3"
)

type Config struct {
	Caption struct {
		MaxWords          int `yaml:"maxWords"`
		MaxSeconds        int `yaml:"maxSeconds"`
		PollingIntervalMs int `yaml:"pollingIntervalMs"`
	} `yaml:"caption"`
	Prompts struct {
		Initial  string `yaml:"initial"`
		FollowUp string `yaml:"followUp"`
	} `yaml:"prompts"`
	Shortcuts struct {
		ActivateChat string `yaml:"activateChat"`
	} `yaml:"shortcuts"`
	LLM struct {
		Provider string `yaml:"provider"`
		Local    struct {
			URL   string `yaml:"url"`
			Model string `yaml:"model"`
		} `yaml:"local"`
		Online struct {
			URL    string `yaml:"url"`
			APIKey string `yaml:"apiKey"`
			Model  string `yaml:"model"`
		} `yaml:"online"`
	} `yaml:"llm"`
	UI struct {
		FontSize              int    `yaml:"fontSize"`
		UserBubbleColor       string `yaml:"userBubbleColor"`
		AssistantBubbleColor  string `yaml:"assistantBubbleColor"`
		SystemBannerColor     string `yaml:"systemBannerColor"`
		SendButtonColor       string `yaml:"sendButtonColor"`
		UserTextColor         string `yaml:"userTextColor"`
		AssistantTextColor    string `yaml:"assistantTextColor"`
		SystemBannerTextColor string `yaml:"systemBannerTextColor"`
		OverlayBackground     string `yaml:"overlayBackground"`
	} `yaml:"ui"`
	Overlay struct {
		Width              int  `yaml:"width"`
		BorderRadius       int  `yaml:"borderRadius"`
		Padding            int  `yaml:"padding"`
		MaxHeightPercent   int  `yaml:"maxHeightPercent"`
		ShowInitialMessage bool `yaml:"showInitialMessage"`
	} `yaml:"overlay"`
}

var AppConfig Config

func LoadConfig(path string) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()
	decoder := yaml.NewDecoder(f)
	return decoder.Decode(&AppConfig)
}
