#!/bin/bash
set -e

REGISTRY="ghcr.io/lelouch-britannia"
IMAGES=(
  "kubeplayground-backend"
  "kubeplayground-frontend"
  "kubeplayground-validation-service"
)

usage() {
  echo "Usage:"
  echo "  $0 retag <from-tag> <to-tag>   # retag existing images"
  echo "  $0 push <tag>                  # build locally and push"
  echo ""
  echo "Examples:"
  echo "  $0 retag latest 1.1.0"
  echo "  $0 push 1.1.0"
  exit 1
}

cmd="${1}"

case "$cmd" in
  retag)
    FROM_TAG="${2}"
    TO_TAG="${3}"
    [ -z "$FROM_TAG" ] || [ -z "$TO_TAG" ] && usage
    for image in "${IMAGES[@]}"; do
      full="$REGISTRY/$image"
      echo "--- $image ---"
      docker pull "$full:$FROM_TAG"
      docker tag "$full:$FROM_TAG" "$full:$TO_TAG"
      docker push "$full:$TO_TAG"
      echo "Done: $full:$TO_TAG"
    done
    echo "Retagged: $FROM_TAG → $TO_TAG"
    ;;

  push)
    TAG="${2}"
    [ -z "$TAG" ] && usage
    echo "Building TAG=$TAG..."
    TAG=$TAG docker compose build
    for image in "${IMAGES[@]}"; do
      full="$REGISTRY/$image"
      echo "Pushing $full:$TAG..."
      docker push "$full:$TAG"
      docker tag "$full:$TAG" "$full:latest"
      docker push "$full:latest"
      echo "Done: $full:$TAG + latest"
    done
    echo "Built and pushed: $TAG + latest"
    ;;

  *)
    usage
    ;;
esac
