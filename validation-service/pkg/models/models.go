package models

// ValidationRequest represents an incoming validation request (legacy combined endpoint)
type ValidationRequest struct {
	RequestID        string `json:"request_id" binding:"required"`
	UnitSlug         string `json:"unit_slug" binding:"required"`
	UserID           int    `json:"user_id" binding:"required"`
	UserYAML         string `json:"user_yaml" binding:"required"`
	ValidationScript string `json:"validation_script" binding:"required"`
	Language         string `json:"language"`
}

// RunRequest is sent over WebSocket to start manifest execution (phases 1-7)
type RunRequest struct {
	RequestID string `json:"request_id"`
	UnitSlug  string `json:"unit_slug"`
	UserID    int    `json:"user_id"`
	UserYAML  string `json:"user_yaml"`
	Language  string `json:"language"`
}

// ValidateRequest triggers validation only on an existing namespace
type ValidateRequest struct {
	RequestID        string `json:"request_id" binding:"required"`
	Namespace        string `json:"namespace" binding:"required"`
	ValidationScript string `json:"validation_script" binding:"required"`
}

// ValidateResponse is the result of validation-only execution
type ValidateResponse struct {
	RequestID   string                 `json:"request_id"`
	Namespace   string                 `json:"namespace"`
	Passed      bool                   `json:"passed"`
	Message     string                 `json:"message"`
	TestResults []ValidationTestResult `json:"test_results,omitempty"`
	DurationMs  int64                  `json:"duration_ms"`
}

// WSMessage is a server→client message sent over WebSocket during /ws/run
type WSMessage struct {
	Type    string      `json:"type"` // phase_start, phase_complete, phase_progress, run_complete, error
	Phase   string      `json:"phase,omitempty"`
	Status  string      `json:"status,omitempty"` // success, failed
	Message string      `json:"message,omitempty"`
	Data    interface{} `json:"data,omitempty"`
}

// RunCompleteData is the data payload for the "run_complete" message
type RunCompleteData struct {
	Namespace      string               `json:"namespace"`
	ApplyOutput    string               `json:"apply_output,omitempty"`
	ResourceStatus []ResourceStatusInfo `json:"resource_status,omitempty"`
	PodLogs        []PodLogEntry        `json:"pod_logs,omitempty"`
	Events         []KubeEvent          `json:"events,omitempty"`
	Phases         []ExecutionPhase     `json:"phases,omitempty"`
	DurationMs     int64                `json:"duration_ms"`
}

// ValidationResponse represents the validation result
type ValidationResponse struct {
	RequestID       string                 `json:"request_id"`
	IsValid         bool                   `json:"is_valid"`
	Passed          bool                   `json:"passed"`
	Message         string                 `json:"message"`
	ApplyOutput     string                 `json:"apply_output,omitempty"`
	ResourceStatus  []ResourceStatusInfo   `json:"resource_status,omitempty"`
	PodLogs         []PodLogEntry          `json:"pod_logs,omitempty"`
	Events          []KubeEvent            `json:"events,omitempty"`
	TestResults     []ValidationTestResult `json:"test_results,omitempty"`
	ValidationError *ValidationError       `json:"validation_error,omitempty"`
	DurationMs      int64                  `json:"duration_ms"`
	Namespace       string                 `json:"namespace,omitempty"`
	Phases          []ExecutionPhase       `json:"phases,omitempty"`
}

// ExecutionPhase tracks each phase of the pipeline
type ExecutionPhase struct {
	Name       string `json:"name"`
	Status     string `json:"status"` // "success", "failed", "skipped"
	DurationMs int64  `json:"duration_ms"`
	Output     string `json:"output,omitempty"`
	Error      string `json:"error,omitempty"`
}

// ValidationTestResult represents a single test result
type ValidationTestResult struct {
	Name        string `json:"name"`
	Passed      bool   `json:"passed"`
	Output      string `json:"output"`
	ErrorOutput string `json:"error_output,omitempty"`
	DurationMs  int64  `json:"duration_ms"`
}

// ResourceStatusInfo represents a Kubernetes resource status
type ResourceStatusInfo struct {
	Kind      string `json:"kind"`
	Name      string `json:"name"`
	Namespace string `json:"namespace"`
	Status    string `json:"status"`
	Ready     bool   `json:"ready"`
	Message   string `json:"message,omitempty"`
	Age       string `json:"age,omitempty"`
}

// PodLogEntry represents logs from a specific pod
type PodLogEntry struct {
	PodName       string `json:"pod_name"`
	ContainerName string `json:"container_name"`
	Logs          string `json:"logs"`
	Phase         string `json:"phase"`
	Ready         bool   `json:"ready"`
}

// KubeEvent represents a Kubernetes event
type KubeEvent struct {
	Type    string `json:"type"`
	Reason  string `json:"reason"`
	Message string `json:"message"`
	Object  string `json:"object"`
	Age     string `json:"age"`
	Count   int32  `json:"count"`
}

// ValidationError represents validation errors
type ValidationError struct {
	Type    string                 `json:"type"`
	Code    string                 `json:"code,omitempty"`
	Message string                 `json:"message"`
	Details map[string]interface{} `json:"details,omitempty"`
}

// ClusterInfo holds Kubernetes cluster information
type ClusterInfo struct {
	Name    string
	Version string
}

// HealthResponse represents service health status
type HealthResponse struct {
	Status     string           `json:"status"`
	Version    string           `json:"version"`
	Kubernetes KubernetesHealth `json:"kubernetes"`
	Timestamp  string           `json:"timestamp"`
}

// KubernetesHealth represents cluster health
type KubernetesHealth struct {
	Connected   bool   `json:"connected"`
	Context     string `json:"context"`
	Cluster     string `json:"cluster"`
	Version     string `json:"version"`
	Environment string `json:"environment"`
}

// ErrorResponse represents API error responses
type ErrorResponse struct {
	Error   string                 `json:"error"`
	Message string                 `json:"message"`
	Details map[string]interface{} `json:"details,omitempty"`
}

// ValidationResourceInfo represents created K8s resources
type ValidationResourceInfo struct {
	Namespace string   `json:"namespace"`
	Resources []string `json:"resources"`
	CleanedUp bool     `json:"cleaned_up"`
}
