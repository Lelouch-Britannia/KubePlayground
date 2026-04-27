package config

import (
	"fmt"
	"os"
	"path/filepath"
	"time"

	"gopkg.in/yaml.v3"
)

// Config represents the application configuration
type Config struct {
	Server     ServerConfig     `yaml:"server"`
	Kubernetes KubernetesConfig `yaml:"kubernetes"`
	MongoDB    MongoDBConfig    `yaml:"mongodb"`
	Auth       AuthConfig       `yaml:"auth"`
	Logging    LoggingConfig    `yaml:"logging"`
}

// ServerConfig contains HTTP server settings
type ServerConfig struct {
	Port         int           `yaml:"port"`
	Host         string        `yaml:"host"`
	ReadTimeout  time.Duration `yaml:"read_timeout"`
	WriteTimeout time.Duration `yaml:"write_timeout"`
	IdleTimeout  time.Duration `yaml:"idle_timeout"`
}

// KubernetesConfig contains K8s client settings
type KubernetesConfig struct {
	KubeconfigPath string                       `yaml:"kubeconfig_path"`
	Context        string                       `yaml:"context"`
	KubectlPath    string                       `yaml:"kubectl_path"`
	Timeout        time.Duration                `yaml:"timeout"`
	DryRunFirst    bool                         `yaml:"dry_run_first"`
	Environments   map[string]EnvironmentConfig `yaml:"environments"`
	AutoDetectEnv  bool                         `yaml:"auto_detect_env"`
}

// EnvironmentConfig defines environment-specific settings
type EnvironmentConfig struct {
	Contexts        []string       `yaml:"contexts"`
	NamespaceQuotas ResourceQuotas `yaml:"namespace_quotas"`
	CleanupPolicy   string         `yaml:"cleanup_policy"` // immediate, delayed
	Timeout         time.Duration  `yaml:"timeout"`
	NetworkPolicies bool           `yaml:"network_policies"`
	PodSecurityStd  string         `yaml:"pod_security_standards"` // privileged, baseline, restricted
}

// ResourceQuotas defines resource limits for namespaces
type ResourceQuotas struct {
	Pods   int    `yaml:"pods"`
	CPU    string `yaml:"cpu"`
	Memory string `yaml:"memory"`
}

// MongoDBConfig contains MongoDB connection settings
type MongoDBConfig struct {
	URI      string `yaml:"uri"`
	Database string `yaml:"database"`
	Enabled  bool   `yaml:"enabled"` // Can fetch validation scripts directly if enabled
}

// AuthConfig contains service-to-service authentication
type AuthConfig struct {
	JWTSecret     string        `yaml:"jwt_secret"`
	TokenExpiry   time.Duration `yaml:"token_expiry"`
	ServiceTokens []string      `yaml:"service_tokens"` // Pre-shared tokens for core service
}

// LoggingConfig contains logging settings
type LoggingConfig struct {
	Level  string `yaml:"level"`  // debug, info, warn, error
	Format string `yaml:"format"` // json, text
}

// LoadConfig loads configuration from file or environment variables
func LoadConfig() (*Config, error) {
	// Determine config file path
	configPath := os.Getenv("CONFIG_PATH")
	if configPath == "" {
		configPath = "config/config.yaml"
	}

	// Check if file exists
	if _, err := os.Stat(configPath); os.IsNotExist(err) {
		// Use default configuration
		return getDefaultConfig(), nil
	}

	// Read config file
	data, err := os.ReadFile(configPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read config file: %w", err)
	}

	// Parse YAML
	var cfg Config
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("failed to parse config file: %w", err)
	}

	// Override with environment variables
	applyEnvironmentOverrides(&cfg)

	// Validate configuration
	if err := validateConfig(&cfg); err != nil {
		return nil, fmt.Errorf("invalid configuration: %w", err)
	}

	return &cfg, nil
}

// getDefaultConfig returns default configuration
func getDefaultConfig() *Config {
	homeDir, _ := os.UserHomeDir()
	kubeconfigPath := filepath.Join(homeDir, ".kube", "config")
	if kubeconfigEnv := os.Getenv("KUBECONFIG"); kubeconfigEnv != "" {
		kubeconfigPath = kubeconfigEnv
	}

	return &Config{
		Server: ServerConfig{
			Port:         8080,
			Host:         "0.0.0.0",
			ReadTimeout:  30 * time.Second,
			WriteTimeout: 120 * time.Second,
			IdleTimeout:  120 * time.Second,
		},
		Kubernetes: KubernetesConfig{
			KubeconfigPath: kubeconfigPath,
			Context:        "", // Use current-context
			KubectlPath:    "", // Auto-detect
			Timeout:        60 * time.Second,
			DryRunFirst:    true,
			AutoDetectEnv:  true,
			Environments: map[string]EnvironmentConfig{
				"local": {
					Contexts: []string{"microk8s", "minikube", "kind", "k3s", "docker-desktop", "colima"},
					NamespaceQuotas: ResourceQuotas{
						Pods:   20,
						CPU:    "4",
						Memory: "8Gi",
					},
					CleanupPolicy:   "immediate",
					Timeout:         60 * time.Second,
					NetworkPolicies: false,
					PodSecurityStd:  "baseline",
				},
				"dev": {
					Contexts: []string{"dev-cluster", "staging"},
					NamespaceQuotas: ResourceQuotas{
						Pods:   10,
						CPU:    "2",
						Memory: "4Gi",
					},
					CleanupPolicy:   "immediate",
					Timeout:         90 * time.Second,
					NetworkPolicies: false,
					PodSecurityStd:  "baseline",
				},
				"production": {
					Contexts: []string{"eks-prod", "aks-prod", "gke-prod", "production"},
					NamespaceQuotas: ResourceQuotas{
						Pods:   5,
						CPU:    "1",
						Memory: "2Gi",
					},
					CleanupPolicy:   "delayed",
					Timeout:         120 * time.Second,
					NetworkPolicies: true,
					PodSecurityStd:  "restricted",
				},
			},
		},
		MongoDB: MongoDBConfig{
			URI:      os.Getenv("MONGO_URI"),
			Database: "development",
			Enabled:  false, // Direct MongoDB access disabled by default, use core service API
		},
		Auth: AuthConfig{
			JWTSecret:     os.Getenv("JWT_SECRET"),
			TokenExpiry:   1 * time.Hour,
			ServiceTokens: []string{}, // Loaded from env
		},
		Logging: LoggingConfig{
			Level:  "info",
			Format: "json",
		},
	}
}

// applyEnvironmentOverrides overrides config with environment variables
func applyEnvironmentOverrides(cfg *Config) {
	if port := os.Getenv("SERVER_PORT"); port != "" {
		fmt.Sscanf(port, "%d", &cfg.Server.Port)
	}

	if kubeconfig := os.Getenv("KUBECONFIG"); kubeconfig != "" {
		cfg.Kubernetes.KubeconfigPath = kubeconfig
	}

	if context := os.Getenv("K8S_CONTEXT"); context != "" {
		cfg.Kubernetes.Context = context
	}

	if mongoURI := os.Getenv("MONGO_URI"); mongoURI != "" {
		cfg.MongoDB.URI = mongoURI
	}

	if jwtSecret := os.Getenv("JWT_SECRET"); jwtSecret != "" {
		cfg.Auth.JWTSecret = jwtSecret
	}

	if logLevel := os.Getenv("LOG_LEVEL"); logLevel != "" {
		cfg.Logging.Level = logLevel
	}
}

// validateConfig validates configuration values
func validateConfig(cfg *Config) error {
	if cfg.Server.Port < 1 || cfg.Server.Port > 65535 {
		return fmt.Errorf("invalid server port: %d", cfg.Server.Port)
	}

	if cfg.Kubernetes.KubeconfigPath == "" {
		return fmt.Errorf("kubeconfig path is required")
	}

	if len(cfg.Kubernetes.Environments) == 0 {
		return fmt.Errorf("at least one environment configuration is required")
	}

	return nil
}
