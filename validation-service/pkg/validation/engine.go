package validation

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/kubeplayground/validation-service/pkg/config"
	"github.com/kubeplayground/validation-service/pkg/k8s"
	"github.com/kubeplayground/validation-service/pkg/logger"
	"github.com/kubeplayground/validation-service/pkg/models"
)

// Engine coordinates validation execution
type Engine struct {
	k8sClient *k8s.K8sClient
	config    *config.Config
	logger    *logger.Logger
}

// PhaseCallback is invoked before/after each phase to stream progress to the client
type PhaseCallback func(msg models.WSMessage)

// NewEngine creates a new validation engine
func NewEngine(k8sClient *k8s.K8sClient, cfg *config.Config, log *logger.Logger) *Engine {
	return &Engine{
		k8sClient: k8sClient,
		config:    cfg,
		logger:    log,
	}
}

// GetContext returns Kubernetes context
func (e *Engine) GetContext() string {
	return e.k8sClient.GetContext()
}

// GetEnvironment returns detected environment
func (e *Engine) GetEnvironment() string {
	return e.k8sClient.GetEnvironment()
}

// GetClusterInfo returns cluster information
func (e *Engine) GetClusterInfo() k8s.ClusterInfo {
	return e.k8sClient.GetClusterInfo()
}

// QuickHealthCheck performs fast health check
func (e *Engine) QuickHealthCheck() error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	err := e.k8sClient.PreflightCheck()
	if err != nil {
		return err
	}

	select {
	case <-ctx.Done():
		return fmt.Errorf("health check timeout")
	default:
		return nil
	}
}

// Validate executes the full pipeline: apply → wait → status → logs → validate
func (e *Engine) Validate(ctx context.Context, req *models.ValidationRequest) *models.ValidationResponse {
	start := time.Now()
	response := &models.ValidationResponse{
		RequestID: req.RequestID,
		IsValid:   false,
		Passed:    false,
		Message:   "",
		Phases:    []models.ExecutionPhase{},
	}

	e.logger.Event(logger.ValidationStart).
		Success().
		Msg("Starting validation pipeline").
		Field("request_id", req.RequestID).
		Field("unit_slug", req.UnitSlug).
		Emit()

	// =====================================================================
	// Phase 1: Create ephemeral namespace
	// =====================================================================
	phaseStart := time.Now()
	namespace, err := e.k8sClient.CreateEphemeralNamespace(req.RequestID, req.UnitSlug, req.UserID)
	if err != nil {
		response.Phases = append(response.Phases, models.ExecutionPhase{
			Name:       "create_namespace",
			Status:     "failed",
			DurationMs: int64(time.Since(phaseStart).Milliseconds()),
			Error:      err.Error(),
		})
		response.ValidationError = &models.ValidationError{
			Type:    "namespace_error",
			Code:    "NAMESPACE_CREATE_FAILED",
			Message: "Failed to create validation namespace",
			Details: map[string]interface{}{"error": err.Error()},
		}
		response.Message = "Failed to create namespace for validation"
		response.DurationMs = int64(time.Since(start).Milliseconds())
		e.logValidationFailure(req, err, float64(response.DurationMs))
		return response
	}
	response.Namespace = namespace
	response.Phases = append(response.Phases, models.ExecutionPhase{
		Name:       "create_namespace",
		Status:     "success",
		DurationMs: int64(time.Since(phaseStart).Milliseconds()),
		Output:     fmt.Sprintf("Namespace %s created", namespace),
	})

	// Ensure namespace cleanup
	defer func() {
		if err := e.k8sClient.DeleteNamespace(namespace); err != nil {
			e.logger.Error("Failed to cleanup namespace", err, map[string]interface{}{
				"namespace":  namespace,
				"request_id": req.RequestID,
			})
		}
	}()

	// =====================================================================
	// Phase 2: Syntax validation (dry-run)
	// =====================================================================
	if e.config.Kubernetes.DryRunFirst {
		phaseStart = time.Now()
		if err := e.validateSyntax(req.UserYAML, namespace); err != nil {
			response.Phases = append(response.Phases, models.ExecutionPhase{
				Name:       "syntax_check",
				Status:     "failed",
				DurationMs: int64(time.Since(phaseStart).Milliseconds()),
				Error:      err.Error(),
			})
			response.ValidationError = &models.ValidationError{
				Type:    "syntax_error",
				Code:    "YAML_INVALID",
				Message: "YAML syntax validation failed",
				Details: map[string]interface{}{"error": err.Error()},
			}
			response.Message = "YAML has syntax errors"
			response.DurationMs = int64(time.Since(start).Milliseconds())
			e.logValidationFailure(req, err, float64(response.DurationMs))
			return response
		}
		response.Phases = append(response.Phases, models.ExecutionPhase{
			Name:       "syntax_check",
			Status:     "success",
			DurationMs: int64(time.Since(phaseStart).Milliseconds()),
			Output:     "YAML syntax is valid",
		})
	}

	// =====================================================================
	// Phase 3: Apply manifest to cluster
	// =====================================================================
	phaseStart = time.Now()
	applyOutput, err := e.applyYAML(req.UserYAML, namespace)
	if err != nil {
		response.ApplyOutput = applyOutput
		response.Phases = append(response.Phases, models.ExecutionPhase{
			Name:       "apply",
			Status:     "failed",
			DurationMs: int64(time.Since(phaseStart).Milliseconds()),
			Output:     applyOutput,
			Error:      err.Error(),
		})
		response.ValidationError = &models.ValidationError{
			Type:    "resource_apply_error",
			Code:    "RESOURCE_APPLY_FAILED",
			Message: "Failed to apply resources to cluster",
			Details: map[string]interface{}{"error": err.Error(), "output": applyOutput},
		}
		response.Message = "kubectl apply failed"
		response.DurationMs = int64(time.Since(start).Milliseconds())
		e.logValidationFailure(req, err, float64(response.DurationMs))
		return response
	}
	response.ApplyOutput = applyOutput
	response.Phases = append(response.Phases, models.ExecutionPhase{
		Name:       "apply",
		Status:     "success",
		DurationMs: int64(time.Since(phaseStart).Milliseconds()),
		Output:     applyOutput,
	})

	// =====================================================================
	// Phase 4: Wait for resources to stabilize
	// =====================================================================
	phaseStart = time.Now()
	waitTimeout := 30 * time.Second
	if e.config.Kubernetes.Timeout > 0 && e.config.Kubernetes.Timeout < waitTimeout {
		waitTimeout = e.config.Kubernetes.Timeout
	}
	_ = e.k8sClient.WaitForResources(namespace, waitTimeout)
	response.Phases = append(response.Phases, models.ExecutionPhase{
		Name:       "wait_ready",
		Status:     "success",
		DurationMs: int64(time.Since(phaseStart).Milliseconds()),
		Output:     "Resources stabilized",
	})

	// =====================================================================
	// Phase 5: Collect resource status
	// =====================================================================
	phaseStart = time.Now()
	response.ResourceStatus = e.k8sClient.GetResourceStatus(namespace)
	resourceSummary := fmt.Sprintf("%d resources found", len(response.ResourceStatus))
	response.Phases = append(response.Phases, models.ExecutionPhase{
		Name:       "resource_status",
		Status:     "success",
		DurationMs: int64(time.Since(phaseStart).Milliseconds()),
		Output:     resourceSummary,
	})

	// =====================================================================
	// Phase 6: Collect pod logs
	// =====================================================================
	phaseStart = time.Now()
	response.PodLogs = e.k8sClient.GetPodLogs(namespace, 100)
	logSummary := fmt.Sprintf("Collected logs from %d containers", len(response.PodLogs))
	response.Phases = append(response.Phases, models.ExecutionPhase{
		Name:       "collect_logs",
		Status:     "success",
		DurationMs: int64(time.Since(phaseStart).Milliseconds()),
		Output:     logSummary,
	})

	// =====================================================================
	// Phase 7: Collect events
	// =====================================================================
	phaseStart = time.Now()
	response.Events = e.k8sClient.GetEvents(namespace)
	response.Phases = append(response.Phases, models.ExecutionPhase{
		Name:       "collect_events",
		Status:     "success",
		DurationMs: int64(time.Since(phaseStart).Milliseconds()),
		Output:     fmt.Sprintf("%d events", len(response.Events)),
	})

	// =====================================================================
	// Phase 8: Run validation script
	// =====================================================================
	phaseStart = time.Now()
	testResults, err := e.executeValidationScript(req.ValidationScript, namespace)
	if err != nil {
		response.Phases = append(response.Phases, models.ExecutionPhase{
			Name:       "validation",
			Status:     "failed",
			DurationMs: int64(time.Since(phaseStart).Milliseconds()),
			Error:      err.Error(),
		})
		response.TestResults = testResults
		response.ValidationError = &models.ValidationError{
			Type:    "test_execution_error",
			Code:    "TEST_EXECUTION_FAILED",
			Message: "Validation tests execution failed",
			Details: map[string]interface{}{"error": err.Error()},
		}
		response.Message = "Validation script failed to execute"
		response.DurationMs = int64(time.Since(start).Milliseconds())
		e.logValidationFailure(req, err, float64(response.DurationMs))
		return response
	}
	response.TestResults = testResults
	response.Phases = append(response.Phases, models.ExecutionPhase{
		Name:       "validation",
		Status:     "success",
		DurationMs: int64(time.Since(phaseStart).Milliseconds()),
		Output:     fmt.Sprintf("%d tests executed", len(testResults)),
	})

	// =====================================================================
	// Determine overall result
	// =====================================================================
	allPassed := true
	for _, test := range testResults {
		if !test.Passed {
			allPassed = false
			break
		}
	}

	response.Passed = allPassed
	response.IsValid = allPassed
	if allPassed {
		response.Message = "All validation tests passed"
	} else {
		failCount := 0
		for _, t := range testResults {
			if !t.Passed {
				failCount++
			}
		}
		response.Message = fmt.Sprintf("%d of %d tests failed", failCount, len(testResults))
	}

	duration := float64(time.Since(start).Milliseconds())
	response.DurationMs = int64(duration)

	e.logger.Event(logger.ValidationSuccess).
		Success().
		Msg("Validation pipeline completed").
		Duration(duration).
		Field("request_id", req.RequestID).
		Field("passed", allPassed).
		Field("namespace", namespace).
		Field("resources", len(response.ResourceStatus)).
		Field("pod_logs", len(response.PodLogs)).
		Field("events", len(response.Events)).
		Emit()

	return response
}

// RunManifest executes phases 1-7 (create namespace → apply → wait → collect status/logs/events)
// and streams progress via the callback. Returns the run result. The namespace is left alive
// so that ValidateOnly can be called separately.
func (e *Engine) RunManifest(ctx context.Context, req *models.RunRequest, onPhase PhaseCallback) *models.RunCompleteData {
	start := time.Now()
	result := &models.RunCompleteData{
		Phases: []models.ExecutionPhase{},
	}

	e.logger.Event(logger.ValidationStart).
		Success().
		Msg("Starting run pipeline").
		Field("request_id", req.RequestID).
		Field("unit_slug", req.UnitSlug).
		Emit()

	emit := func(msg models.WSMessage) {
		if onPhase != nil {
			onPhase(msg)
		}
	}

	// =====================================================================
	// Phase 1: Create ephemeral namespace
	// =====================================================================
	emit(models.WSMessage{Type: "phase_start", Phase: "create_namespace", Message: "Creating namespace..."})
	phaseStart := time.Now()
	namespace, err := e.k8sClient.CreateEphemeralNamespace(req.RequestID, req.UnitSlug, req.UserID)
	dur := int64(time.Since(phaseStart).Milliseconds())
	if err != nil {
		phase := models.ExecutionPhase{Name: "create_namespace", Status: "failed", DurationMs: dur, Error: err.Error()}
		result.Phases = append(result.Phases, phase)
		emit(models.WSMessage{Type: "phase_complete", Phase: "create_namespace", Status: "failed", Message: err.Error(), Data: map[string]interface{}{"duration_ms": dur}})
		emit(models.WSMessage{Type: "run_complete", Status: "failed", Message: "Failed to create namespace", Data: result})
		result.DurationMs = int64(time.Since(start).Milliseconds())
		return result
	}
	result.Namespace = namespace
	phase := models.ExecutionPhase{Name: "create_namespace", Status: "success", DurationMs: dur, Output: fmt.Sprintf("Namespace %s created", namespace)}
	result.Phases = append(result.Phases, phase)
	emit(models.WSMessage{Type: "phase_complete", Phase: "create_namespace", Status: "success", Message: namespace, Data: map[string]interface{}{"namespace": namespace, "duration_ms": dur}})

	// =====================================================================
	// Phase 2: Syntax validation (dry-run)
	// =====================================================================
	if e.config.Kubernetes.DryRunFirst {
		emit(models.WSMessage{Type: "phase_start", Phase: "syntax_check", Message: "Validating YAML syntax..."})
		phaseStart = time.Now()
		if err := e.validateSyntax(req.UserYAML, namespace); err != nil {
			dur = int64(time.Since(phaseStart).Milliseconds())
			p := models.ExecutionPhase{Name: "syntax_check", Status: "failed", DurationMs: dur, Error: err.Error()}
			result.Phases = append(result.Phases, p)
			emit(models.WSMessage{Type: "phase_complete", Phase: "syntax_check", Status: "failed", Message: err.Error(), Data: map[string]interface{}{"duration_ms": dur}})
			// Clean up namespace on syntax error
			_ = e.k8sClient.DeleteNamespace(namespace)
			emit(models.WSMessage{Type: "run_complete", Status: "failed", Message: "YAML syntax error", Data: result})
			result.DurationMs = int64(time.Since(start).Milliseconds())
			return result
		}
		dur = int64(time.Since(phaseStart).Milliseconds())
		result.Phases = append(result.Phases, models.ExecutionPhase{Name: "syntax_check", Status: "success", DurationMs: dur, Output: "YAML syntax is valid"})
		emit(models.WSMessage{Type: "phase_complete", Phase: "syntax_check", Status: "success", Message: "YAML syntax is valid", Data: map[string]interface{}{"duration_ms": dur}})
	}

	// =====================================================================
	// Phase 3: Apply manifest to cluster
	// =====================================================================
	emit(models.WSMessage{Type: "phase_start", Phase: "apply", Message: "Applying manifest to cluster..."})
	phaseStart = time.Now()
	applyOutput, err := e.applyYAML(req.UserYAML, namespace)
	dur = int64(time.Since(phaseStart).Milliseconds())
	result.ApplyOutput = applyOutput
	if err != nil {
		result.Phases = append(result.Phases, models.ExecutionPhase{Name: "apply", Status: "failed", DurationMs: dur, Output: applyOutput, Error: err.Error()})
		emit(models.WSMessage{Type: "phase_complete", Phase: "apply", Status: "failed", Message: err.Error(), Data: map[string]interface{}{"output": applyOutput, "duration_ms": dur}})
		_ = e.k8sClient.DeleteNamespace(namespace)
		emit(models.WSMessage{Type: "run_complete", Status: "failed", Message: "kubectl apply failed", Data: result})
		result.DurationMs = int64(time.Since(start).Milliseconds())
		return result
	}
	result.Phases = append(result.Phases, models.ExecutionPhase{Name: "apply", Status: "success", DurationMs: dur, Output: applyOutput})
	emit(models.WSMessage{Type: "phase_complete", Phase: "apply", Status: "success", Message: "Resources applied", Data: map[string]interface{}{"output": applyOutput, "duration_ms": dur}})

	// =====================================================================
	// Phase 4: Wait for resources to stabilize
	// =====================================================================
	emit(models.WSMessage{Type: "phase_start", Phase: "wait_ready", Message: "Waiting for resources to become ready..."})
	phaseStart = time.Now()
	waitTimeout := 30 * time.Second
	if e.config.Kubernetes.Timeout > 0 && e.config.Kubernetes.Timeout < waitTimeout {
		waitTimeout = e.config.Kubernetes.Timeout
	}
	_ = e.k8sClient.WaitForResources(namespace, waitTimeout)
	dur = int64(time.Since(phaseStart).Milliseconds())
	result.Phases = append(result.Phases, models.ExecutionPhase{Name: "wait_ready", Status: "success", DurationMs: dur, Output: "Resources stabilized"})
	emit(models.WSMessage{Type: "phase_complete", Phase: "wait_ready", Status: "success", Message: "Resources ready", Data: map[string]interface{}{"duration_ms": dur}})

	// =====================================================================
	// Phase 5: Collect resource status
	// =====================================================================
	emit(models.WSMessage{Type: "phase_start", Phase: "resource_status", Message: "Collecting resource status..."})
	phaseStart = time.Now()
	result.ResourceStatus = e.k8sClient.GetResourceStatus(namespace)
	dur = int64(time.Since(phaseStart).Milliseconds())
	summary := fmt.Sprintf("%d resources found", len(result.ResourceStatus))
	result.Phases = append(result.Phases, models.ExecutionPhase{Name: "resource_status", Status: "success", DurationMs: dur, Output: summary})
	emit(models.WSMessage{Type: "phase_complete", Phase: "resource_status", Status: "success", Message: summary, Data: map[string]interface{}{"resources": result.ResourceStatus, "duration_ms": dur}})

	// =====================================================================
	// Phase 6: Collect pod logs
	// =====================================================================
	emit(models.WSMessage{Type: "phase_start", Phase: "collect_logs", Message: "Collecting pod logs..."})
	phaseStart = time.Now()
	result.PodLogs = e.k8sClient.GetPodLogs(namespace, 100)
	dur = int64(time.Since(phaseStart).Milliseconds())
	logSummary := fmt.Sprintf("Collected logs from %d containers", len(result.PodLogs))
	result.Phases = append(result.Phases, models.ExecutionPhase{Name: "collect_logs", Status: "success", DurationMs: dur, Output: logSummary})
	emit(models.WSMessage{Type: "phase_complete", Phase: "collect_logs", Status: "success", Message: logSummary, Data: map[string]interface{}{"pod_logs": result.PodLogs, "duration_ms": dur}})

	// =====================================================================
	// Phase 7: Collect events
	// =====================================================================
	emit(models.WSMessage{Type: "phase_start", Phase: "collect_events", Message: "Collecting cluster events..."})
	phaseStart = time.Now()
	result.Events = e.k8sClient.GetEvents(namespace)
	dur = int64(time.Since(phaseStart).Milliseconds())
	eventSummary := fmt.Sprintf("%d events", len(result.Events))
	result.Phases = append(result.Phases, models.ExecutionPhase{Name: "collect_events", Status: "success", DurationMs: dur, Output: eventSummary})
	emit(models.WSMessage{Type: "phase_complete", Phase: "collect_events", Status: "success", Message: eventSummary, Data: map[string]interface{}{"events": result.Events, "duration_ms": dur}})

	// =====================================================================
	// Done - namespace stays alive for validation
	// =====================================================================
	result.DurationMs = int64(time.Since(start).Milliseconds())
	emit(models.WSMessage{Type: "run_complete", Status: "success", Message: "Resources are ready", Data: result})

	e.logger.Event(logger.ValidationSuccess).
		Success().
		Msg("Run pipeline completed").
		Duration(float64(result.DurationMs)).
		Field("request_id", req.RequestID).
		Field("namespace", namespace).
		Field("resources", len(result.ResourceStatus)).
		Field("pod_logs", len(result.PodLogs)).
		Field("events", len(result.Events)).
		Emit()

	return result
}

// ValidateOnly runs the validation script against an existing namespace (phase 8 only).
func (e *Engine) ValidateOnly(ctx context.Context, req *models.ValidateRequest) *models.ValidateResponse {
	start := time.Now()
	response := &models.ValidateResponse{
		RequestID: req.RequestID,
		Namespace: req.Namespace,
		Passed:    false,
		Message:   "",
	}

	e.logger.Info("Starting validation-only", map[string]interface{}{
		"request_id": req.RequestID,
		"namespace":  req.Namespace,
	})

	testResults, err := e.executeValidationScript(req.ValidationScript, req.Namespace)
	if err != nil {
		response.TestResults = testResults
		response.Message = "Validation script failed to execute"
		response.DurationMs = int64(time.Since(start).Milliseconds())
		return response
	}

	response.TestResults = testResults

	allPassed := true
	for _, t := range testResults {
		if !t.Passed {
			allPassed = false
			break
		}
	}

	response.Passed = allPassed
	if allPassed {
		response.Message = "All validation tests passed"
	} else {
		failCount := 0
		for _, t := range testResults {
			if !t.Passed {
				failCount++
			}
		}
		response.Message = fmt.Sprintf("%d of %d tests failed", failCount, len(testResults))
	}

	response.DurationMs = int64(time.Since(start).Milliseconds())

	e.logger.Info("Validation-only completed", map[string]interface{}{
		"request_id":  req.RequestID,
		"namespace":   req.Namespace,
		"passed":      allPassed,
		"duration_ms": response.DurationMs,
	})

	return response
}

// CleanupNamespace deletes a namespace (called after validation or on disconnect)
func (e *Engine) CleanupNamespace(namespace string) error {
	return e.k8sClient.DeleteNamespace(namespace)
}

// validateSyntax performs client-side dry-run validation
func (e *Engine) validateSyntax(yamlContent, namespace string) error {
	tmpFile, err := os.CreateTemp("", "validation-*.yaml")
	if err != nil {
		return fmt.Errorf("failed to create temp file: %w", err)
	}
	defer os.Remove(tmpFile.Name())

	if _, err := tmpFile.WriteString(yamlContent); err != nil {
		return fmt.Errorf("failed to write YAML to temp file: %w", err)
	}
	tmpFile.Close()

	cmd := exec.Command("kubectl", "apply", "-f", tmpFile.Name(), "-n", namespace, "--dry-run=client")
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("syntax validation failed: %s", string(output))
	}

	return nil
}

// applyYAML applies user YAML to the namespace and returns the output
func (e *Engine) applyYAML(yamlContent, namespace string) (string, error) {
	start := time.Now()

	tmpFile, err := os.CreateTemp("", "apply-*.yaml")
	if err != nil {
		return "", fmt.Errorf("failed to create temp file: %w", err)
	}
	defer os.Remove(tmpFile.Name())

	if _, err := tmpFile.WriteString(yamlContent); err != nil {
		return "", fmt.Errorf("failed to write YAML: %w", err)
	}
	tmpFile.Close()

	cmd := exec.Command("kubectl", "apply", "-f", tmpFile.Name(), "-n", namespace)
	output, err := cmd.CombinedOutput()
	applyOutput := string(output)

	if err != nil {
		e.logger.Event(logger.KubectlApply).
			Failure(logger.ErrResourceApplyFail.String(), err).
			Msg("Failed to apply resources").
			Field("namespace", namespace).
			Field("output", applyOutput).
			Emit()
		return applyOutput, fmt.Errorf("kubectl apply failed: %s", applyOutput)
	}

	duration := float64(time.Since(start).Milliseconds())
	e.logger.Event(logger.KubectlApply).
		Success().
		Msg("Resources applied successfully").
		Duration(duration).
		Field("namespace", namespace).
		Field("output", applyOutput).
		Emit()

	return applyOutput, nil
}

// executeValidationScript runs the validation script
func (e *Engine) executeValidationScript(script, namespace string) ([]models.ValidationTestResult, error) {
	start := time.Now()
	var results []models.ValidationTestResult

	tmpDir, err := os.MkdirTemp("", "validation-script-")
	if err != nil {
		return nil, fmt.Errorf("failed to create temp dir: %w", err)
	}
	defer os.RemoveAll(tmpDir)

	// Preprocess the script:
	// 1. Inject a kubectl wrapper that adds --namespace automatically
	//    (kubeconfig is read-only so we can't use kubectl config set-context)
	// 2. Strip "kubectl apply" lines since resources are already deployed
	preamble := fmt.Sprintf(`#!/bin/bash
# === Auto-injected preamble ===
export NAMESPACE="%s"
export KUBECONFIG="%s"
_real_kubectl=$(which kubectl)
kubectl() {
  $_real_kubectl --namespace="$NAMESPACE" "$@"
}
export -f kubectl
# ===============================
`, namespace, e.config.Kubernetes.KubeconfigPath)

	lines := strings.Split(script, "\n")
	var filtered []string
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		// Skip shebang — we have our own in the preamble
		if strings.HasPrefix(trimmed, "#!/") {
			continue
		}
		// Skip kubectl apply lines (resources already deployed by RunManifest)
		if strings.HasPrefix(trimmed, "kubectl apply") {
			continue
		}
		// Skip the "# Apply the manifest" comment
		if trimmed == "# Apply the manifest" {
			continue
		}
		filtered = append(filtered, line)
	}

	processedScript := preamble + strings.Join(filtered, "\n")

	scriptPath := filepath.Join(tmpDir, "validate.sh")
	if err := os.WriteFile(scriptPath, []byte(processedScript), 0755); err != nil {
		return nil, fmt.Errorf("failed to write script: %w", err)
	}

	cmd := exec.Command("/bin/bash", scriptPath)
	cmd.Env = append(os.Environ(),
		fmt.Sprintf("NAMESPACE=%s", namespace),
		fmt.Sprintf("KUBECONFIG=%s", e.config.Kubernetes.KubeconfigPath),
	)
	cmd.Dir = tmpDir

	output, err := cmd.CombinedOutput()
	testDuration := float64(time.Since(start).Milliseconds())

	outputLines := strings.Split(string(output), "\n")
	testPassed := err == nil

	result := models.ValidationTestResult{
		Name:       "Validation Script",
		Passed:     testPassed,
		Output:     string(output),
		DurationMs: int64(testDuration),
	}

	if err != nil {
		result.ErrorOutput = err.Error()
	}

	results = append(results, result)

	e.logger.Event(logger.TestExecution).
		Success().
		Msg("Validation script executed").
		Duration(testDuration).
		Field("namespace", namespace).
		Field("passed", testPassed).
		Field("output_lines", len(outputLines)).
		Emit()

	return results, nil
}

// logValidationFailure logs validation failure event
func (e *Engine) logValidationFailure(req *models.ValidationRequest, err error, duration float64) {
	e.logger.Event(logger.ValidationFailure).
		Failure(logger.ErrValidationTimeout.String(), err).
		Msg("Validation failed").
		Duration(duration).
		Field("unit_slug", req.UnitSlug).
		Emit()
}

// GenerateRequestID generates unique request ID
func GenerateRequestID() string {
	return uuid.New().String()
}
