package api

import (
	"encoding/json"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"github.com/kubeplayground/validation-service/pkg/config"
	"github.com/kubeplayground/validation-service/pkg/logger"
	"github.com/kubeplayground/validation-service/pkg/models"
	"github.com/kubeplayground/validation-service/pkg/validation"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 4096,
	CheckOrigin:     func(r *http.Request) bool { return true },
}

// Server represents the HTTP API server
type Server struct {
	engine *validation.Engine
	config *config.Config
	logger *logger.Logger
}

// NewServer creates a new API server
func NewServer(engine *validation.Engine, cfg *config.Config, log *logger.Logger) *Server {
	return &Server{
		engine: engine,
		config: cfg,
		logger: log,
	}
}

// SetupRoutes configures HTTP routes
func (s *Server) SetupRoutes() *gin.Engine {
	// Set Gin mode
	gin.SetMode(gin.ReleaseMode)

	// Middleware
	router := gin.New()
	router.Use(gin.Recovery())
	router.Use(s.loggingMiddleware())
	router.Use(s.corsMiddleware())

	// Health check (no auth required)
	router.GET("/health", s.handleHealth)
	router.GET("/ready", s.handleReadiness)

	// WebSocket endpoint for manifest execution (auth via query param)
	router.GET("/ws/run", s.handleWSRun)

	// API routes (require authentication)
	api := router.Group("/api/v1")
	api.Use(s.authMiddleware())
	{
		api.POST("/validate", s.handleValidate)          // Legacy: full pipeline
		api.POST("/validate-only", s.handleValidateOnly) // New: validation on existing namespace
		api.POST("/cleanup", s.handleCleanup)            // Cleanup namespace
	}

	return router
}

// handleHealth returns service health status
func (s *Server) handleHealth(c *gin.Context) {
	clusterInfo := s.engine.GetClusterInfo()
	response := models.HealthResponse{
		Status:  "healthy",
		Version: "1.0.0",
		Kubernetes: models.KubernetesHealth{
			Connected:   true,
			Context:     s.engine.GetContext(),
			Cluster:     clusterInfo.Name,
			Version:     clusterInfo.Version,
			Environment: s.engine.GetEnvironment(),
		},
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	}
	c.JSON(http.StatusOK, response)
}

// handleReadiness checks if service is ready to accept requests
func (s *Server) handleReadiness(c *gin.Context) {
	if err := s.engine.QuickHealthCheck(); err != nil {
		c.JSON(http.StatusServiceUnavailable, models.ErrorResponse{
			Error:   "not_ready",
			Message: "Kubernetes cluster unreachable",
			Details: map[string]interface{}{"error": err.Error()},
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ready"})
}

// handleWSRun upgrades to WebSocket, reads a RunRequest, and streams phase updates.
func (s *Server) handleWSRun(c *gin.Context) {
	// Auth via query parameter (WebSocket can't send custom headers easily)
	token := c.Query("token")
	if !s.validateToken(token) {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse{
			Error:   "unauthorized",
			Message: "Invalid or missing token",
		})
		return
	}

	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		s.logger.Error("WebSocket upgrade failed", err, nil)
		return
	}
	defer conn.Close()

	// Use a mutex to protect concurrent writes to the WebSocket
	var wsMu sync.Mutex
	writeJSON := func(msg models.WSMessage) {
		wsMu.Lock()
		defer wsMu.Unlock()
		if err := conn.WriteJSON(msg); err != nil {
			s.logger.Error("WebSocket write error", err, nil)
		}
	}

	// Read the run request from the client
	_, rawMsg, err := conn.ReadMessage()
	if err != nil {
		s.logger.Error("WebSocket read error", err, nil)
		return
	}

	var req models.RunRequest
	if err := json.Unmarshal(rawMsg, &req); err != nil {
		writeJSON(models.WSMessage{Type: "error", Message: "Invalid request: " + err.Error()})
		return
	}

	s.logger.Info("WebSocket run request received", map[string]interface{}{
		"request_id": req.RequestID,
		"unit_slug":  req.UnitSlug,
		"user_id":    req.UserID,
	})

	// Run manifest with streaming callback
	result := s.engine.RunManifest(c.Request.Context(), &req, func(msg models.WSMessage) {
		writeJSON(msg)
	})

	// If run failed (no namespace), the engine already sent run_complete via callback.
	// If run succeeded but client disconnects, clean up the namespace after a timeout.
	if result.Namespace != "" {
		// Start a cleanup timer — if the client doesn't call /validate-only + /cleanup
		// within 5 minutes, auto-cleanup the namespace.
		go func() {
			time.Sleep(5 * time.Minute)
			s.logger.Info("Auto-cleaning stale namespace", map[string]interface{}{
				"namespace": result.Namespace,
			})
			_ = s.engine.CleanupNamespace(result.Namespace)
		}()
	}
}

// handleValidate processes validation requests (legacy combined endpoint)
func (s *Server) handleValidate(c *gin.Context) {
	var req models.ValidationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		s.logger.Warn("Invalid validation request", map[string]interface{}{"error": err.Error()})
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "invalid_request",
			Message: "Invalid request payload",
			Details: map[string]interface{}{"error": err.Error()},
		})
		return
	}

	s.logger.Info("Validation request received", map[string]interface{}{
		"request_id": req.RequestID,
		"unit_slug":  req.UnitSlug,
		"user_id":    req.UserID,
	})

	result := s.engine.Validate(c.Request.Context(), &req)
	c.JSON(http.StatusOK, result)
}

// handleValidateOnly runs only the validation script on an existing namespace
func (s *Server) handleValidateOnly(c *gin.Context) {
	var req models.ValidateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		s.logger.Warn("Invalid validate-only request", map[string]interface{}{"error": err.Error()})
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "invalid_request",
			Message: "Invalid request payload",
			Details: map[string]interface{}{"error": err.Error()},
		})
		return
	}

	s.logger.Info("Validate-only request received", map[string]interface{}{
		"request_id": req.RequestID,
		"namespace":  req.Namespace,
	})

	result := s.engine.ValidateOnly(c.Request.Context(), &req)
	c.JSON(http.StatusOK, result)
}

// handleCleanup deletes a namespace
func (s *Server) handleCleanup(c *gin.Context) {
	var body struct {
		Namespace string `json:"namespace" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "invalid_request",
			Message: "Missing namespace",
		})
		return
	}

	s.logger.Info("Cleanup request", map[string]interface{}{"namespace": body.Namespace})

	if err := s.engine.CleanupNamespace(body.Namespace); err != nil {
		s.logger.Error("Cleanup failed", err, map[string]interface{}{"namespace": body.Namespace})
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "cleanup_failed",
			Message: err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "cleaned_up", "namespace": body.Namespace})
}

// validateToken checks a token against configured service tokens or JWT
func (s *Server) validateToken(token string) bool {
	if token == "" {
		return false
	}
	for _, serviceToken := range s.config.Auth.ServiceTokens {
		if token == serviceToken {
			return true
		}
	}
	if s.config.Auth.JWTSecret != "" {
		return true
	}
	return false
}

// loggingMiddleware logs HTTP requests
func (s *Server) loggingMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		path := c.Request.URL.Path
		method := c.Request.Method

		c.Next()

		duration := float64(time.Since(start).Milliseconds())
		status := c.Writer.Status()

		s.logger.Info("HTTP request", map[string]interface{}{
			"method":      method,
			"path":        path,
			"status":      status,
			"duration_ms": duration,
			"ip":          c.ClientIP(),
		})
	}
}

// corsMiddleware handles CORS headers
func (s *Server) corsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}

		c.Next()
	}
}

// authMiddleware validates service-to-service authentication
func (s *Server) authMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.JSON(http.StatusUnauthorized, models.ErrorResponse{
				Error:   "unauthorized",
				Message: "Authorization header required",
			})
			c.Abort()
			return
		}

		token := authHeader
		if len(authHeader) > 7 && authHeader[:7] == "Bearer " {
			token = authHeader[7:]
		}

		if !s.validateToken(token) {
			c.JSON(http.StatusUnauthorized, models.ErrorResponse{
				Error:   "unauthorized",
				Message: "Invalid authentication token",
			})
			c.Abort()
			return
		}

		c.Next()
	}
}
