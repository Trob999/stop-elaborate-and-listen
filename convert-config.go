package main

import (
	"encoding/json"
	"fmt"
	"os"

	"gopkg.in/yaml.v3"
)

func main() {
	// Read YAML file
	yamlFile, err := os.ReadFile("config.yaml")
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error reading config.yaml: %v\n", err)
		os.Exit(1)
	}

	// Unmarshal YAML into a generic map
	var config interface{}
	if err := yaml.Unmarshal(yamlFile, &config); err != nil {
		fmt.Fprintf(os.Stderr, "Error parsing YAML: %v\n", err)
		os.Exit(1)
	}

	// Marshal to pretty JSON
	jsonBytes, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error converting to JSON: %v\n", err)
		os.Exit(1)
	}

	// Write JSON file
	if err := os.WriteFile("web-extension/config.json", jsonBytes, 0644); err != nil {
		fmt.Fprintf(os.Stderr, "Error writing config.json: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("Converted config.yaml to web-extension/config.json")
}
