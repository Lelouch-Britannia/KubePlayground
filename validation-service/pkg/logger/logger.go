package logger

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"time"
)

// LogLevel represents log severity
type LogLevel string

const (
	DEBUG LogLevel = "debug"
	INFO  LogLevel = "info"
	WARN  LogLevel = "warn"
	ERROR LogLevel = "error"
	FATAL LogLevel = "fatal"
)

// LogEvent represents event types (similar to DAO SDK)
type LogEvent string

const (
	ValidationStart    LogEvent = "validation.start"
	ValidationSuccess  LogEvent = "validation.success"
	ValidationFailure  LogEvent = "validation.failure"
	NamespaceCreated   LogEvent = "namespace.created"
	NamespaceDeleted   LogEvent = "namespace.deleted"
	KubectlApply       LogEvent = "kubectl.apply"
	TestExecution      LogEvent = "test.execution"
	ClusterConnect     LogEvent = "cluster.connect"
	ClusterHealthCheck LogEvent = "cluster.health_check"
)

// LogOutcome represents event outcome
type LogOutcome string

const (
	Success LogOutcome = "success"
	Failure LogOutcome = "failure"
)

// Logger provides structured logging similar to DAO SDK LogBuilder
type Logger struct {
	serviceName string
	logger      *log.Logger
}

// LogEntry represents a structured log entry
type LogEntry struct {
	Timestamp string                 `json:"@timestamp"`
	Level     LogLevel               `json:"log.level"`
	Logger    string                 `json:"log.logger"`
	Event     LogEvent               `json:"event.action,omitempty"`
	Outcome   LogOutcome             `json:"event.outcome,omitempty"`
	Message   string                 `json:"message"`
	Duration  *float64               `json:"event.duration,omitempty"` // milliseconds
	ErrorCode string                 `json:"error.code,omitempty"`
	ErrorMsg  string                 `json:"error.message,omitempty"`
	Context   map[string]interface{} `json:"context,omitempty"`
}

// NewLogger creates a new logger instance
func NewLogger(serviceName string) *Logger {
	return &Logger{
		serviceName: serviceName,
		logger:      log.New(os.Stdout, "", 0),
	}
}

// Debug logs debug-level message
func (l *Logger) Debug(message string, context map[string]interface{}) {
	l.log(DEBUG, "", "", message, nil, "", "", context)
}

// Info logs info-level message
func (l *Logger) Info(message string, context map[string]interface{}) {
	l.log(INFO, "", "", message, nil, "", "", context)
}

// Warn logs warning-level message
func (l *Logger) Warn(message string, context map[string]interface{}) {
	l.log(WARN, "", "", message, nil, "", "", context)
}

// Error logs error-level message
func (l *Logger) Error(message string, err error, context map[string]interface{}) {
	errMsg := ""
	if err != nil {
		errMsg = err.Error()
	}
	l.log(ERROR, "", "", message, nil, "", errMsg, context)
}

// Fatal logs fatal-level message and exits
func (l *Logger) Fatal(message string, err error, context map[string]interface{}) {
	errMsg := ""
	if err != nil {
		errMsg = err.Error()
	}
	l.log(FATAL, "", "", message, nil, "", errMsg, context)
	os.Exit(1)
}

// LogEvent logs an event with outcome (similar to DAO SDK pattern)
func (l *Logger) LogEvent(event LogEvent, outcome LogOutcome, message string, duration *float64, context map[string]interface{}) {
	level := INFO
	if outcome == Failure {
		level = ERROR
	}
	l.log(level, event, outcome, message, duration, "", "", context)
}

// LogEventWithError logs a failed event with error details
func (l *Logger) LogEventWithError(event LogEvent, message string, errorCode string, err error, duration *float64, context map[string]interface{}) {
	errMsg := ""
	if err != nil {
		errMsg = err.Error()
	}
	l.log(ERROR, event, Failure, message, duration, errorCode, errMsg, context)
}

// log is the internal logging method
func (l *Logger) log(level LogLevel, event LogEvent, outcome LogOutcome, message string, duration *float64, errorCode string, errorMsg string, context map[string]interface{}) {
	entry := LogEntry{
		Timestamp: time.Now().UTC().Format(time.RFC3339),
		Level:     level,
		Logger:    l.serviceName,
		Message:   message,
		Context:   context,
	}

	if event != "" {
		entry.Event = event
	}
	if outcome != "" {
		entry.Outcome = outcome
	}
	if duration != nil {
		entry.Duration = duration
	}
	if errorCode != "" {
		entry.ErrorCode = errorCode
	}
	if errorMsg != "" {
		entry.ErrorMsg = errorMsg
	}

	// Serialize to JSON
	data, err := json.Marshal(entry)
	if err != nil {
		// Fallback to simple logging if JSON fails
		l.logger.Printf("[%s] %s: %s", level, event, message)
		return
	}

	l.logger.Println(string(data))
}

// Builder provides fluent interface for complex log entries
type Builder struct {
	logger   *Logger
	event    LogEvent
	outcome  LogOutcome
	message  string
	duration *float64
	errCode  string
	err      error
	context  map[string]interface{}
}

// Event starts building a log entry with event
func (l *Logger) Event(event LogEvent) *Builder {
	return &Builder{
		logger:  l,
		event:   event,
		context: make(map[string]interface{}),
	}
}

// Success marks the event as successful
func (b *Builder) Success() *Builder {
	b.outcome = Success
	return b
}

// Failure marks the event as failed
func (b *Builder) Failure(errorCode string, err error) *Builder {
	b.outcome = Failure
	b.errCode = errorCode
	b.err = err
	return b
}

// Msg sets the log message
func (b *Builder) Msg(message string) *Builder {
	b.message = message
	return b
}

// Duration sets event duration in milliseconds
func (b *Builder) Duration(ms float64) *Builder {
	b.duration = &ms
	return b
}

// Field adds a context field
func (b *Builder) Field(key string, value interface{}) *Builder {
	b.context[key] = value
	return b
}

// K8sContext adds Kubernetes context fields
func (b *Builder) K8sContext(namespace, cluster, context string) *Builder {
	b.context["k8s.namespace"] = namespace
	b.context["k8s.cluster"] = cluster
	b.context["k8s.context"] = context
	return b
}

// Emit emits the log entry
func (b *Builder) Emit() {
	if b.outcome == Failure {
		errMsg := ""
		if b.err != nil {
			errMsg = b.err.Error()
		}
		b.logger.log(ERROR, b.event, b.outcome, b.message, b.duration, b.errCode, errMsg, b.context)
	} else {
		b.logger.log(INFO, b.event, b.outcome, b.message, b.duration, "", "", b.context)
	}
}

// ErrorCode represents validation error codes
type ErrorCode string

const (
	ErrKubeconfigNotFound  ErrorCode = "KUBECONFIG_NOT_FOUND"
	ErrClusterUnreachable  ErrorCode = "CLUSTER_UNREACHABLE"
	ErrNamespaceCreateFail ErrorCode = "NAMESPACE_CREATE_FAILED"
	ErrYAMLInvalid         ErrorCode = "YAML_INVALID"
	ErrResourceApplyFail   ErrorCode = "RESOURCE_APPLY_FAILED"
	ErrValidationTimeout   ErrorCode = "VALIDATION_TIMEOUT"
	ErrTestExecutionFail   ErrorCode = "TEST_EXECUTION_FAILED"
	ErrCleanupFailed       ErrorCode = "CLEANUP_FAILED"
	ErrInsufficientRBAC    ErrorCode = "INSUFFICIENT_RBAC"
	ErrQuotaExceeded       ErrorCode = "QUOTA_EXCEEDED"
)

// String converts ErrorCode to string
func (e ErrorCode) String() string {
	return string(e)
}

// NewError creates a formatted error with code
func NewError(code ErrorCode, message string, args ...interface{}) error {
	return fmt.Errorf("[%s] %s", code, fmt.Sprintf(message, args...))
}
