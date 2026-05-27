# Build stage
FROM golang:1.23-alpine AS builder

# Install dependencies
# hadolint ignore=DL3018
RUN apk add --no-cache git ca-certificates

WORKDIR /build

# Copy go module files first for better layer caching
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build binary
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o validation-service .

# Runtime stage
FROM alpine:3.21

# Install kubectl and bash for script execution
# hadolint ignore=DL3018
RUN apk add --no-cache ca-certificates bash curl && \
    curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl" && \
    chmod +x kubectl && \
    mv kubectl /usr/local/bin/

WORKDIR /app

# Copy binary from builder
COPY --from=builder /build/validation-service .

# Create config directory
RUN mkdir -p /app/config

EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

CMD ["./validation-service"]
