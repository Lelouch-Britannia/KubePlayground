#!/bin/bash
set -e

REGISTRY="ghcr.io/lelouch-britannia"
FROM_TAG="${1:-latest}"
TO_TAG="${2}"

IMAGES=(
  "kubeplayground-backend"
  "kubeplayground-frontend"
  "kubeplayground-validation-service"
)

if [ -z "$TO_TAG" ]; then
  echo "Usage: $0 <from-tag> <to-tag>"
  echo "  Example: $0 latest 1.1.0"
  exit 1
fi

for image in "${IMAGES[@]}"; do
  full="$REGISTRY/$image"
  echo "--- $image ---"
  docker pull "$full:$FROM_TAG"
  docker tag "$full:$FROM_TAG" "$full:$TO_TAG"
  docker push "$full:$TO_TAG"
  echo "Done: $full:$TO_TAG"
  echo ""
done

echo "All images retagged and pushed: $FROM_TAG → $TO_TAG"
