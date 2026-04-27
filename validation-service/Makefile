.PHONY: help build run test clean docker-build docker-run

APP_NAME=validation-service
VERSION ?= 1.0.0
DOCKER_IMAGE=$(APP_NAME):$(VERSION)

help: ## Show this help message
	@echo "Usage: make [target]"
	@echo ""
	@echo "Targets:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-20s %s\n", $$1, $$2}'

build: ## Build the Go binary
	@echo "Building $(APP_NAME)..."
	go build -o $(APP_NAME) .
	@echo "Build complete: ./$(APP_NAME)"

run: ## Run the service locally
	@echo "Starting $(APP_NAME)..."
	go run main.go

test: ## Run unit tests
	@echo "Running tests..."
	go test -v ./...

test-integration: ## Run integration tests (requires K8s cluster)
	@echo "Running integration tests..."
	go test -v -tags=integration ./...

coverage: ## Generate test coverage report
	@echo "Generating coverage report..."
	go test -coverprofile=coverage.out ./...
	go tool cover -html=coverage.out

lint: ## Run linter
	@echo "Running linter..."
	golangci-lint run

clean: ## Clean build artifacts
	@echo "Cleaning..."
	rm -f $(APP_NAME)
	rm -f coverage.out
	rm -rf tmp/

docker-build: ## Build Docker image
	@echo "Building Docker image $(DOCKER_IMAGE)..."
	docker build -t $(DOCKER_IMAGE) .
	docker tag $(DOCKER_IMAGE) $(APP_NAME):latest

docker-run: ## Run Docker container
	@echo "Running Docker container..."
	docker run --rm \
		-p 8080:8080 \
		-v $(HOME)/.kube/config:/root/.kube/config:ro \
		-e JWT_SECRET=dev-secret \
		$(DOCKER_IMAGE)

docker-push: ## Push Docker image to registry
	@echo "Pushing Docker image..."
	docker push $(DOCKER_IMAGE)

deps: ## Download dependencies
	@echo "Downloading dependencies..."
	go mod download
	go mod tidy

verify: ## Verify dependencies
	@echo "Verifying dependencies..."
	go mod verify

fmt: ## Format Go code
	@echo "Formatting code..."
	go fmt ./...

check: fmt lint test ## Run all checks (format, lint, test)

install-tools: ## Install development tools
	@echo "Installing tools..."
	go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest

kubernetes-check: ## Check Kubernetes cluster connection
	@echo "Checking Kubernetes cluster..."
	kubectl cluster-info
	kubectl version --short
	@echo "Current context: $$(kubectl config current-context)"

dev: ## Run in development mode with hot reload (requires air)
	@echo "Starting development server..."
	air

.DEFAULT_GOAL := help
