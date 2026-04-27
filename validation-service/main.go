package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/kubeplayground/validation-service/pkg/api"
	"github.com/kubeplayground/validation-service/pkg/config"
	"github.com/kubeplayground/validation-service/pkg/k8s"
	"github.com/kubeplayground/validation-service/pkg/logger"
	"github.com/kubeplayground/validation-service/pkg/validation"
)

func main() {
	// Initialize logger
	appLogger := logger.NewLogger("validation-service")
	appLogger.Info("Starting validation service", map[string]interface{}{
		"version": "1.0.0",
		"go":      "1.22",
	})

	// Load configuration
	cfg, err := config.LoadConfig()
	if err != nil {
		appLogger.Fatal("Failed to load configuration", err, nil)
	}

	// Initialize Kubernetes client
	k8sClient, err := k8s.NewK8sClient(cfg.Kubernetes, appLogger)
	if err != nil {
		appLogger.Fatal("Failed to initialize Kubernetes client", err, nil)
	}

	// Run pre-flight checks
	if err := k8sClient.PreflightCheck(); err != nil {
		appLogger.Fatal("Pre-flight checks failed", err, nil)
	}

	appLogger.Info("Kubernetes client initialized successfully", map[string]interface{}{
		"context":     k8sClient.GetContext(),
		"environment": k8sClient.GetEnvironment(),
		"cluster":     k8sClient.GetClusterInfo(),
	})

	// Initialize validation engine
	validationEngine := validation.NewEngine(k8sClient, cfg, appLogger)

	// Initialize API server
	apiServer := api.NewServer(validationEngine, cfg, appLogger)
	router := apiServer.SetupRoutes()

	// Start HTTP server
	server := &http.Server{
		Addr:         fmt.Sprintf(":%d", cfg.Server.Port),
		Handler:      router,
		ReadTimeout:  cfg.Server.ReadTimeout,
		WriteTimeout: cfg.Server.WriteTimeout,
		IdleTimeout:  cfg.Server.IdleTimeout,
	}

	// Graceful shutdown handling
	go func() {
		appLogger.Info("HTTP server starting", map[string]interface{}{
			"port": cfg.Server.Port,
			"host": cfg.Server.Host,
		})
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			appLogger.Fatal("Failed to start HTTP server", err, nil)
		}
	}()

	// Wait for interrupt signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	appLogger.Info("Shutting down server...", nil)

	// Graceful shutdown with timeout
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		appLogger.Error("Server forced to shutdown", err, nil)
	}

	appLogger.Info("Server exited gracefully", nil)
}
