#!/usr/bin/env bash
set -e

cd "$(dirname "$0")/../"

helm uninstall sklein-bibliography-corpus-indexer --namespace sklein-bibliography-corpus-indexer-test 2>/dev/null || true
kubectl delete namespace sklein-bibliography-corpus-indexer-test 2>/dev/null || true
