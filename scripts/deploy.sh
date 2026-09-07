#!/bin/bash
# deploy.sh — pull the CI-built images and roll the stack forward.
#
# Since .github/workflows/build-images.yml moved image builds to GitHub
# Actions, the VPS no longer compiles anything — it just pulls. This script
# is the whole deploy: pull, migrate, up, prune.
#
#   ./scripts/deploy.sh          # pull :latest and restart changed services
#   ./scripts/deploy.sh --no-migrate
#
# If GHCR packages are private, `docker login ghcr.io` once first (a
# read:packages PAT is enough).

set -euo pipefail
cd "$(dirname "$0")/.."

RUN_MIGRATE=1
[ "${1:-}" = "--no-migrate" ] && RUN_MIGRATE=0

echo "==> Pre-flight: free memory"
free -h | head -2

echo "==> Pulling images"
docker compose pull api worker frontend

if [ "$RUN_MIGRATE" = "1" ]; then
  echo "==> Applying database migrations (prisma migrate deploy)"
  # api container carries the prisma CLI (a runtime dep on purpose).
  docker compose run --rm --no-deps api npx prisma migrate deploy
fi

echo "==> Rolling services"
docker compose up -d

echo "==> Waiting for API health"
for i in $(seq 1 30); do
  if docker compose exec -T api node -e "fetch('http://localhost:3000/health').then(r=>r.json()).then(j=>process.exit(j.status==='ok'?0:1)).catch(()=>process.exit(1))" 2>/dev/null; then
    echo "    API healthy"
    break
  fi
  sleep 2
done

echo "==> Pruning dangling images"
docker image prune -f

echo "==> Done"
docker compose ps
