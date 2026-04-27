# Validation Service

Go microservice for validating Kubernetes YAML exercises in KubePlayground.

## Architecture

```
Core Service (Python/FastAPI)
    ↓ POST /api/v1/validate
    ↓ (user YAML + validation script from MongoDB)
Validation Service (Go)
    1. Create ephemeral namespace
    2. Apply resource quotas
    3. Syntax validation (kubectl dry-run)
    4. Apply user YAML
    5. Run validation script
    6. Capture results
    7. Delete namespace
    ↓
Return: test results, resource status, errors
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `KUBECONFIG` | Path to kubeconfig | `~/.kube/config` |
| `K8S_CONTEXT` | Kubernetes context | current-context |
| `JWT_SECRET` | Service-to-service auth | - |
| `LOG_LEVEL` | Log level | `info` |
| `SERVER_PORT` | HTTP port | `8080` |

## Development

```bash
# Build and run
make build && make run

# Or via Docker Compose (from project root)
docker-compose up -d validation-service
```

## API

### Health Check

```
GET /health
```

### Validate YAML

```
POST /api/v1/validate
Authorization: Bearer <token>

{
  "request_id": "uuid",
  "unit_slug": "pod-basics",
  "user_id": "123",
  "user_yaml": "apiVersion: v1\nkind: Pod\n...",
  "validation_script": "#!/bin/bash\nkubectl get pod -n $NAMESPACE\n...",
  "language": "yaml"
}
```

## Supported Clusters

minikube, kind, k3s, microk8s, Docker Desktop, EKS, AKS, GKE — any cluster accessible via standard kubeconfig.
