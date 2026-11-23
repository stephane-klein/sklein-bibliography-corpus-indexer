#!/usr/bin/env bash
set -e

cd "$(dirname "$0")/../"

kubectl get namespace sklein-bibliography-corpus-indexer-test 2>/dev/null || kubectl create namespace sklein-bibliography-corpus-indexer-test

helm upgrade --install sklein-bibliography-corpus-indexer oci://ghcr.io/stephane-klein/charts/sklein-bibliography-corpus-indexer \
    --namespace sklein-bibliography-corpus-indexer-test \
    --set ingress.enabled=true \
    --set ingress.host=sklein-bibliography-corpus-indexer-test.sklein.internal \
    --set-json 'ingress.annotations={"cert-manager.io/cluster-issuer":"homelab-ca"}' \
    --set-json 'ingress.tls=[{"hosts":["sklein-bibliography-corpus-indexer-test.sklein.internal"],"secretName":"sklein-bibliography-corpus-indexer-test-tls"}]' \
    --set seed.enabled=true

echo "Waiting for rollout to complete..."
kubectl rollout status deployment/sklein-bibliography-corpus-indexer --namespace sklein-bibliography-corpus-indexer-test --timeout=300s

echo ""
echo "Application is ready at:"
echo "  https://sklein-bibliography-corpus-indexer-test.sklein.internal"
