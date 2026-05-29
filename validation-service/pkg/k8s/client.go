package k8s

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/kubeplayground/validation-service/pkg/config"
	"github.com/kubeplayground/validation-service/pkg/logger"
	"github.com/kubeplayground/validation-service/pkg/models"
	appsv1 "k8s.io/api/apps/v1"
	batchv1 "k8s.io/api/batch/v1"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/tools/clientcmd"
)

// K8sClient wraps Kubernetes client with validation-specific operations
type K8sClient struct {
	clientset   *kubernetes.Clientset
	config      config.KubernetesConfig
	environment string
	context     string
	clusterName string
	logger      *logger.Logger
	envConfig   config.EnvironmentConfig
}

// ClusterInfo contains cluster metadata
type ClusterInfo struct {
	Name     string
	Version  string
	Platform string // eks, aks, gke, minikube, etc.
}

// NewK8sClient creates a new Kubernetes client
func NewK8sClient(cfg config.KubernetesConfig, log *logger.Logger) (*K8sClient, error) {
	start := time.Now()

	// Expand kubeconfig path
	kubeconfigPath := cfg.KubeconfigPath
	if strings.HasPrefix(kubeconfigPath, "~/") {
		homeDir, _ := os.UserHomeDir()
		kubeconfigPath = filepath.Join(homeDir, kubeconfigPath[2:])
	}

	// Check if kubeconfig exists
	if _, err := os.Stat(kubeconfigPath); os.IsNotExist(err) {
		return nil, logger.NewError(logger.ErrKubeconfigNotFound, "kubeconfig not found at %s", kubeconfigPath)
	}

	// Load kubeconfig
	configLoader := clientcmd.NewNonInteractiveDeferredLoadingClientConfig(
		&clientcmd.ClientConfigLoadingRules{ExplicitPath: kubeconfigPath},
		&clientcmd.ConfigOverrides{CurrentContext: cfg.Context},
	)

	restConfig, err := configLoader.ClientConfig()
	if err != nil {
		return nil, fmt.Errorf("failed to load kubeconfig: %w", err)
	}

	// Create clientset
	clientset, err := kubernetes.NewForConfig(restConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to create Kubernetes client: %w", err)
	}

	// Get current context
	rawConfig, err := configLoader.RawConfig()
	if err != nil {
		return nil, fmt.Errorf("failed to load raw kubeconfig: %w", err)
	}

	contextName := rawConfig.CurrentContext
	if cfg.Context != "" {
		contextName = cfg.Context
	}

	contextObj, exists := rawConfig.Contexts[contextName]
	if !exists {
		return nil, fmt.Errorf("context %s not found in kubeconfig", contextName)
	}

	clusterName := contextObj.Cluster

	client := &K8sClient{
		clientset:   clientset,
		config:      cfg,
		context:     contextName,
		clusterName: clusterName,
		logger:      log,
	}

	// Auto-detect environment
	if cfg.AutoDetectEnv {
		client.environment = client.detectEnvironment()
		client.envConfig = cfg.Environments[client.environment]
	}

	duration := float64(time.Since(start).Milliseconds())
	log.Event(logger.ClusterConnect).
		Success().
		Msg("Kubernetes client initialized").
		Duration(duration).
		Field("context", contextName).
		Field("cluster", clusterName).
		Field("environment", client.environment).
		Emit()

	return client, nil
}

// detectEnvironment determines environment based on context name
func (k *K8sClient) detectEnvironment() string {
	contextLower := strings.ToLower(k.context)

	for envName, envConfig := range k.config.Environments {
		for _, pattern := range envConfig.Contexts {
			if strings.Contains(contextLower, strings.ToLower(pattern)) {
				return envName
			}
		}
	}

	// Default to production (most restrictive) if unknown
	return "production"
}

// PreflightCheck verifies cluster connectivity and permissions
func (k *K8sClient) PreflightCheck() error {
	start := time.Now()
	ctx := context.Background()

	// 1. Server version check
	version, err := k.clientset.Discovery().ServerVersion()
	if err != nil {
		k.logger.Event(logger.ClusterHealthCheck).
			Failure(logger.ErrClusterUnreachable.String(), err).
			Msg("Failed to reach cluster").
			Field("cluster", k.clusterName).
			Emit()
		return logger.NewError(logger.ErrClusterUnreachable, "cluster unreachable: %v", err)
	}

	// 2. Check namespace creation permissions
	testNs := &corev1.Namespace{
		ObjectMeta: metav1.ObjectMeta{
			GenerateName: "preflight-check-",
			Labels: map[string]string{
				"app":     "kubeplayground-validation",
				"purpose": "preflight-check",
			},
		},
	}

	createdNs, err := k.clientset.CoreV1().Namespaces().Create(ctx, testNs, metav1.CreateOptions{})
	if err != nil {
		k.logger.Event(logger.ClusterHealthCheck).
			Failure(logger.ErrInsufficientRBAC.String(), err).
			Msg("Insufficient RBAC permissions for namespace creation").
			Emit()
		return logger.NewError(logger.ErrInsufficientRBAC, "cannot create namespaces: %v", err)
	}

	// 3. Cleanup test namespace
	deletePolicy := metav1.DeletePropagationForeground
	if err := k.clientset.CoreV1().Namespaces().Delete(ctx, createdNs.Name, metav1.DeleteOptions{
		PropagationPolicy: &deletePolicy,
	}); err != nil {
		k.logger.Warn("Failed to cleanup preflight test namespace", map[string]interface{}{
			"namespace": createdNs.Name,
			"error":     err.Error(),
		})
	}

	// 4. Check kubectl binary (optional)
	kubectlPath := k.detectKubectlPath()

	duration := float64(time.Since(start).Milliseconds())
	k.logger.Event(logger.ClusterHealthCheck).
		Success().
		Msg("Pre-flight checks passed").
		Duration(duration).
		Field("k8s_version", version.GitVersion).
		Field("kubectl_path", kubectlPath).
		Emit()

	return nil
}

// detectKubectlPath finds kubectl binary
func (k *K8sClient) detectKubectlPath() string {
	if k.config.KubectlPath != "" {
		return k.config.KubectlPath
	}

	// Check common locations
	locations := []string{
		"/usr/local/bin/kubectl",
		"/usr/bin/kubectl",
	}

	for _, path := range locations {
		if _, err := os.Stat(path); err == nil {
			return path
		}
	}

	// Check PATH
	if path, err := exec.LookPath("kubectl"); err == nil {
		return path
	}

	return "not found"
}

// GetContext returns current Kubernetes context
func (k *K8sClient) GetContext() string {
	return k.context
}

// GetEnvironment returns detected environment
func (k *K8sClient) GetEnvironment() string {
	return k.environment
}

// GetClusterInfo returns cluster metadata
func (k *K8sClient) GetClusterInfo() ClusterInfo {
	version, _ := k.clientset.Discovery().ServerVersion()
	platform := k.detectPlatform()

	return ClusterInfo{
		Name:     k.clusterName,
		Version:  version.GitVersion,
		Platform: platform,
	}
}

// detectPlatform detects K8s platform type
func (k *K8sClient) detectPlatform() string {
	contextLower := strings.ToLower(k.context)

	platforms := map[string]string{
		"eks":            "Amazon EKS",
		"aks":            "Azure AKS",
		"gke":            "Google GKE",
		"minikube":       "Minikube",
		"kind":           "kind",
		"k3s":            "k3s",
		"microk8s":       "MicroK8s",
		"docker-desktop": "Docker Desktop",
		"colima":         "Colima",
	}

	for key, name := range platforms {
		if strings.Contains(contextLower, key) {
			return name
		}
	}

	return "Unknown"
}

// CreateEphemeralNamespace creates a temporary namespace with quotas
func (k *K8sClient) CreateEphemeralNamespace(requestID, unitSlug string, userID int) (string, error) {
	start := time.Now()
	ctx := context.Background()

	// Generate unique namespace name
	nsName := fmt.Sprintf("validation-%s-%d", requestID[:8], time.Now().Unix())

	// Create namespace object
	ns := &corev1.Namespace{
		ObjectMeta: metav1.ObjectMeta{
			Name: nsName,
			Labels: map[string]string{
				"app":         "kubeplayground-validation",
				"request-id":  requestID,
				"unit-slug":   unitSlug,
				"user-id":     fmt.Sprintf("%d", userID),
				"created-at":  time.Now().UTC().Format("20060102T150405Z"),
				"environment": k.environment,
			},
		},
	}

	// Create namespace
	_, err := k.clientset.CoreV1().Namespaces().Create(ctx, ns, metav1.CreateOptions{})
	if err != nil {
		k.logger.Event(logger.NamespaceCreated).
			Failure(logger.ErrNamespaceCreateFail.String(), err).
			Msg("Failed to create namespace").
			Field("namespace", nsName).
			Emit()
		return "", logger.NewError(logger.ErrNamespaceCreateFail, "failed to create namespace: %v", err)
	}

	// Apply resource quotas
	if err := k.applyResourceQuota(nsName); err != nil {
		// Log warning but don't fail - quota is safety net
		k.logger.Warn("Failed to apply resource quota", map[string]interface{}{
			"namespace": nsName,
			"error":     err.Error(),
		})
	}

	// Apply default limit range so pods without explicit resources still satisfy the quota
	if err := k.applyDefaultLimitRange(nsName); err != nil {
		k.logger.Warn("Failed to apply default limit range", map[string]interface{}{
			"namespace": nsName,
			"error":     err.Error(),
		})
	}

	duration := float64(time.Since(start).Milliseconds())
	k.logger.Event(logger.NamespaceCreated).
		Success().
		Msg("Ephemeral namespace created").
		Duration(duration).
		K8sContext(nsName, k.clusterName, k.context).
		Field("unit_slug", unitSlug).
		Emit()

	return nsName, nil
}

// applyResourceQuota applies resource quotas to namespace
func (k *K8sClient) applyResourceQuota(namespace string) error {
	ctx := context.Background()
	quotas := k.envConfig.NamespaceQuotas

	quota := &corev1.ResourceQuota{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "validation-quota",
			Namespace: namespace,
		},
		Spec: corev1.ResourceQuotaSpec{
			Hard: corev1.ResourceList{
				corev1.ResourcePods:   resource.MustParse(fmt.Sprintf("%d", quotas.Pods)),
				corev1.ResourceCPU:    resource.MustParse(quotas.CPU),
				corev1.ResourceMemory: resource.MustParse(quotas.Memory),
			},
		},
	}

	_, err := k.clientset.CoreV1().ResourceQuotas(namespace).Create(ctx, quota, metav1.CreateOptions{})
	return err
}

// applyDefaultLimitRange sets default CPU/memory requests and limits so that
// pods without explicit resource specs still satisfy the ResourceQuota.
func (k *K8sClient) applyDefaultLimitRange(namespace string) error {
	ctx := context.Background()

	lr := &corev1.LimitRange{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "default-resources",
			Namespace: namespace,
		},
		Spec: corev1.LimitRangeSpec{
			Limits: []corev1.LimitRangeItem{
				{
					Type: corev1.LimitTypeContainer,
					Default: corev1.ResourceList{
						corev1.ResourceCPU:    resource.MustParse("100m"),
						corev1.ResourceMemory: resource.MustParse("128Mi"),
					},
					DefaultRequest: corev1.ResourceList{
						corev1.ResourceCPU:    resource.MustParse("50m"),
						corev1.ResourceMemory: resource.MustParse("64Mi"),
					},
				},
			},
		},
	}

	_, err := k.clientset.CoreV1().LimitRanges(namespace).Create(ctx, lr, metav1.CreateOptions{})
	return err
}

// DeleteNamespace deletes a namespace and all its resources
func (k *K8sClient) DeleteNamespace(namespace string) error {
	start := time.Now()
	ctx := context.Background()

	// Apply cleanup policy delay if configured
	if k.envConfig.CleanupPolicy == "delayed" {
		time.Sleep(5 * time.Minute)
	}

	deletePolicy := metav1.DeletePropagationForeground
	err := k.clientset.CoreV1().Namespaces().Delete(ctx, namespace, metav1.DeleteOptions{
		PropagationPolicy: &deletePolicy,
	})

	duration := float64(time.Since(start).Milliseconds())
	if err != nil {
		k.logger.Event(logger.NamespaceDeleted).
			Failure(logger.ErrCleanupFailed.String(), err).
			Msg("Failed to delete namespace").
			Duration(duration).
			Field("namespace", namespace).
			Emit()
		return logger.NewError(logger.ErrCleanupFailed, "failed to delete namespace: %v", err)
	}

	k.logger.Event(logger.NamespaceDeleted).
		Success().
		Msg("Namespace deleted").
		Duration(duration).
		Field("namespace", namespace).
		Emit()

	return nil
}

// GetResourceStatus retrieves status of all resources in a namespace
func (k *K8sClient) GetResourceStatus(namespace string) []models.ResourceStatusInfo {
	ctx := context.Background()
	var resources []models.ResourceStatusInfo

	// Pods
	pods, err := k.clientset.CoreV1().Pods(namespace).List(ctx, metav1.ListOptions{})
	if err == nil {
		for _, pod := range pods.Items {
			ready := pod.Status.Phase == corev1.PodRunning
			readyCount := 0
			totalCount := len(pod.Status.ContainerStatuses)
			for _, cs := range pod.Status.ContainerStatuses {
				if cs.Ready {
					readyCount++
				}
			}
			statusMsg := string(pod.Status.Phase)
			if totalCount > 0 {
				statusMsg = fmt.Sprintf("%s (%d/%d ready)", pod.Status.Phase, readyCount, totalCount)
			}
			// Check for waiting containers with errors
			for _, cs := range pod.Status.ContainerStatuses {
				if cs.State.Waiting != nil && cs.State.Waiting.Reason != "" {
					statusMsg = cs.State.Waiting.Reason
					if cs.State.Waiting.Message != "" {
						statusMsg += ": " + cs.State.Waiting.Message
					}
					ready = false
				}
			}
			age := time.Since(pod.CreationTimestamp.Time).Round(time.Second).String()
			resources = append(resources, models.ResourceStatusInfo{
				Kind:      "Pod",
				Name:      pod.Name,
				Namespace: namespace,
				Status:    statusMsg,
				Ready:     ready,
				Age:       age,
			})
		}
	}

	// Deployments
	deployments, err := k.clientset.AppsV1().Deployments(namespace).List(ctx, metav1.ListOptions{})
	if err == nil {
		for _, d := range deployments.Items {
			ready := d.Status.ReadyReplicas == *d.Spec.Replicas
			statusMsg := fmt.Sprintf("%d/%d replicas ready", d.Status.ReadyReplicas, *d.Spec.Replicas)
			age := time.Since(d.CreationTimestamp.Time).Round(time.Second).String()
			resources = append(resources, models.ResourceStatusInfo{
				Kind:      "Deployment",
				Name:      d.Name,
				Namespace: namespace,
				Status:    statusMsg,
				Ready:     ready,
				Age:       age,
			})
		}
	}

	// Services
	services, err := k.clientset.CoreV1().Services(namespace).List(ctx, metav1.ListOptions{})
	if err == nil {
		for _, s := range services.Items {
			statusMsg := string(s.Spec.Type)
			if s.Spec.ClusterIP != "" {
				statusMsg += " (" + s.Spec.ClusterIP + ")"
			}
			age := time.Since(s.CreationTimestamp.Time).Round(time.Second).String()
			resources = append(resources, models.ResourceStatusInfo{
				Kind:      "Service",
				Name:      s.Name,
				Namespace: namespace,
				Status:    statusMsg,
				Ready:     true,
				Age:       age,
			})
		}
	}

	// ConfigMaps
	configMaps, err := k.clientset.CoreV1().ConfigMaps(namespace).List(ctx, metav1.ListOptions{})
	if err == nil {
		for _, cm := range configMaps.Items {
			age := time.Since(cm.CreationTimestamp.Time).Round(time.Second).String()
			resources = append(resources, models.ResourceStatusInfo{
				Kind:      "ConfigMap",
				Name:      cm.Name,
				Namespace: namespace,
				Status:    fmt.Sprintf("%d data keys", len(cm.Data)),
				Ready:     true,
				Age:       age,
			})
		}
	}

	// Secrets
	secrets, err := k.clientset.CoreV1().Secrets(namespace).List(ctx, metav1.ListOptions{})
	if err == nil {
		for _, s := range secrets.Items {
			age := time.Since(s.CreationTimestamp.Time).Round(time.Second).String()
			resources = append(resources, models.ResourceStatusInfo{
				Kind:      "Secret",
				Name:      s.Name,
				Namespace: namespace,
				Status:    string(s.Type),
				Ready:     true,
				Age:       age,
			})
		}
	}

	// StatefulSets
	statefulSets, err := k.clientset.AppsV1().StatefulSets(namespace).List(ctx, metav1.ListOptions{})
	if err == nil {
		for _, ss := range statefulSets.Items {
			ready := ss.Status.ReadyReplicas == *ss.Spec.Replicas
			statusMsg := fmt.Sprintf("%d/%d replicas ready", ss.Status.ReadyReplicas, *ss.Spec.Replicas)
			age := time.Since(ss.CreationTimestamp.Time).Round(time.Second).String()
			resources = append(resources, models.ResourceStatusInfo{
				Kind:      "StatefulSet",
				Name:      ss.Name,
				Namespace: namespace,
				Status:    statusMsg,
				Ready:     ready,
				Age:       age,
			})
		}
	}

	// DaemonSets
	daemonSets, err := k.clientset.AppsV1().DaemonSets(namespace).List(ctx, metav1.ListOptions{})
	if err == nil {
		for _, ds := range daemonSets.Items {
			ready := ds.Status.NumberReady == ds.Status.DesiredNumberScheduled
			statusMsg := fmt.Sprintf("%d/%d ready", ds.Status.NumberReady, ds.Status.DesiredNumberScheduled)
			age := time.Since(ds.CreationTimestamp.Time).Round(time.Second).String()
			resources = append(resources, models.ResourceStatusInfo{
				Kind:      "DaemonSet",
				Name:      ds.Name,
				Namespace: namespace,
				Status:    statusMsg,
				Ready:     ready,
				Age:       age,
			})
		}
	}

	// Jobs
	jobs, err := k.clientset.BatchV1().Jobs(namespace).List(ctx, metav1.ListOptions{})
	if err == nil {
		for _, j := range jobs.Items {
			ready := j.Status.Succeeded > 0
			statusMsg := fmt.Sprintf("active:%d succeeded:%d failed:%d", j.Status.Active, j.Status.Succeeded, j.Status.Failed)
			age := time.Since(j.CreationTimestamp.Time).Round(time.Second).String()
			resources = append(resources, models.ResourceStatusInfo{
				Kind:      "Job",
				Name:      j.Name,
				Namespace: namespace,
				Status:    statusMsg,
				Ready:     ready,
				Age:       age,
			})
		}
	}

	return resources
}

// GetPodLogs retrieves logs from all pods in a namespace
func (k *K8sClient) GetPodLogs(namespace string, tailLines int64) []models.PodLogEntry {
	ctx := context.Background()
	var logEntries []models.PodLogEntry

	pods, err := k.clientset.CoreV1().Pods(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		k.logger.Warn("Failed to list pods for log collection", map[string]interface{}{
			"namespace": namespace,
			"error":     err.Error(),
		})
		return logEntries
	}

	for _, pod := range pods.Items {
		for _, container := range pod.Spec.Containers {
			opts := &corev1.PodLogOptions{
				Container: container.Name,
				TailLines: &tailLines,
			}

			req := k.clientset.CoreV1().Pods(namespace).GetLogs(pod.Name, opts)
			stream, err := req.Stream(ctx)
			if err != nil {
				// Pod might not be ready yet
				logEntries = append(logEntries, models.PodLogEntry{
					PodName:       pod.Name,
					ContainerName: container.Name,
					Logs:          fmt.Sprintf("(unable to fetch logs: %s)", err.Error()),
					Phase:         string(pod.Status.Phase),
					Ready:         false,
				})
				continue
			}

			buf := new(bytes.Buffer)
			_, err = io.Copy(buf, stream)
			stream.Close()

			logs := buf.String()
			if logs == "" {
				logs = "(no output)"
			}

			// Determine if container is ready
			ready := false
			for _, cs := range pod.Status.ContainerStatuses {
				if cs.Name == container.Name {
					ready = cs.Ready
					break
				}
			}

			logEntries = append(logEntries, models.PodLogEntry{
				PodName:       pod.Name,
				ContainerName: container.Name,
				Logs:          logs,
				Phase:         string(pod.Status.Phase),
				Ready:         ready,
			})
		}

		// Also collect init container logs
		for _, container := range pod.Spec.InitContainers {
			opts := &corev1.PodLogOptions{
				Container: container.Name,
				TailLines: &tailLines,
			}

			req := k.clientset.CoreV1().Pods(namespace).GetLogs(pod.Name, opts)
			stream, err := req.Stream(ctx)
			if err != nil {
				continue
			}

			buf := new(bytes.Buffer)
			io.Copy(buf, stream)
			stream.Close()

			if buf.Len() > 0 {
				logEntries = append(logEntries, models.PodLogEntry{
					PodName:       pod.Name,
					ContainerName: container.Name + " (init)",
					Logs:          buf.String(),
					Phase:         "InitContainer",
				})
			}
		}
	}

	return logEntries
}

// GetEvents retrieves Kubernetes events for a namespace
func (k *K8sClient) GetEvents(namespace string) []models.KubeEvent {
	ctx := context.Background()
	var result []models.KubeEvent

	events, err := k.clientset.CoreV1().Events(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		k.logger.Warn("Failed to list events", map[string]interface{}{
			"namespace": namespace,
			"error":     err.Error(),
		})
		return result
	}

	for _, event := range events.Items {
		age := time.Since(event.LastTimestamp.Time).Round(time.Second).String()
		if event.LastTimestamp.IsZero() {
			age = time.Since(event.CreationTimestamp.Time).Round(time.Second).String()
		}
		result = append(result, models.KubeEvent{
			Type:    event.Type,
			Reason:  event.Reason,
			Message: event.Message,
			Object:  fmt.Sprintf("%s/%s", event.InvolvedObject.Kind, event.InvolvedObject.Name),
			Age:     age,
			Count:   event.Count,
		})
	}

	return result
}

// terminalWaitingReasons are container waiting reasons that indicate the pod
// will never recover without user action (bad image, missing config, runtime error).
var terminalWaitingReasons = map[string]bool{
	"ImagePullBackOff":             true,
	"ErrImagePull":                 true,
	"ErrImageNeverPull":            true,
	"InvalidImageName":             true,
	"CrashLoopBackOff":             true,
	"OOMKilled":                    true,
	"CreateContainerConfigError":   true,
	"CreateContainerError":         true,
	"RunContainerError":            true,
	"ContainerCannotRun":           true,
	"PostStartHookError":           true,
}

// WaitForResources waits for pods to reach a ready or terminal state.
// Returns an error if any pod enters a terminal failure state or if the timeout is exceeded.
func (k *K8sClient) WaitForResources(namespace string, timeout time.Duration) error {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	var pendingCount int
	for {
		select {
		case <-ctx.Done():
			k.logger.Warn("Timed out waiting for resources to stabilize", map[string]interface{}{
				"namespace": namespace,
				"timeout":   timeout.String(),
			})
			return fmt.Errorf("pods did not become ready within %s: %d pod(s) still pending", timeout, pendingCount)
		case <-ticker.C:
			pods, err := k.clientset.CoreV1().Pods(namespace).List(ctx, metav1.ListOptions{})
			if err != nil {
				continue
			}

			if len(pods.Items) == 0 {
				continue
			}

			allReady := true
			pendingCount = 0
			for _, pod := range pods.Items {
				phase := pod.Status.Phase

				// Terminal phase failures
				if phase == corev1.PodFailed {
					return fmt.Errorf("pod %s: pod failed", pod.Name)
				}
				if phase == corev1.PodUnknown {
					return fmt.Errorf("pod %s: pod in unknown state (node may be unreachable)", pod.Name)
				}

				// Check pod conditions for Unschedulable
				for _, cond := range pod.Status.Conditions {
					if cond.Type == corev1.PodScheduled &&
						cond.Status == corev1.ConditionFalse &&
						cond.Reason == "Unschedulable" {
						return fmt.Errorf("pod %s: unschedulable: %s", pod.Name, cond.Message)
					}
				}

				// Check container waiting reasons for terminal states
				for _, cs := range pod.Status.ContainerStatuses {
					if cs.State.Waiting != nil {
						if terminalWaitingReasons[cs.State.Waiting.Reason] {
							msg := cs.State.Waiting.Reason
							if cs.State.Waiting.Message != "" {
								msg += ": " + cs.State.Waiting.Message
							}
							return fmt.Errorf("pod %s: container %s is in terminal state: %s", pod.Name, cs.Name, msg)
						}
					}
				}

				if phase == corev1.PodPending || phase == corev1.PodRunning {
					// Check if Running pods have all containers ready
					if phase == corev1.PodRunning {
						for _, cs := range pod.Status.ContainerStatuses {
							if !cs.Ready {
								allReady = false
								pendingCount++
								break
							}
						}
					} else {
						allReady = false
						pendingCount++
					}
				}
			}

			if allReady {
				k.logger.Info("All pods settled", map[string]interface{}{
					"namespace": namespace,
					"count":     len(pods.Items),
				})
				return nil
			}
		}
	}
}

// Ensure unused imports are used
var (
	_ = &appsv1.Deployment{}
	_ = &batchv1.Job{}
)
