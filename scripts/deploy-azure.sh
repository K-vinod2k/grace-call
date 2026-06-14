#!/usr/bin/env bash
# =============================================================================
# GraceCall — Azure Container Apps deployment script
# =============================================================================
# Usage:
#   chmod +x scripts/deploy-azure.sh
#   ./scripts/deploy-azure.sh
#
# Prerequisites:
#   - Azure CLI installed and logged in:  az login
#   - Docker NOT required locally — ACR builds the image in the cloud via
#     `az acr build` (uses the Dockerfile at the repo root).
#   - Run from the repo root (where the Dockerfile lives).
#
# After running this script:
#   1. Fill in secrets with scripts/set-secrets.sh.example
#   2. Update CALLBACK_BASE_URL in Container Apps env vars
#   3. Update servers[0].url in azure-foundry/openapi-foundry.yaml
#      and copilot-studio/openapi.yaml
# =============================================================================

set -euo pipefail

# -----------------------------------------------------------------------------
# ✏️  Customise these variables before running
# -----------------------------------------------------------------------------
RESOURCE_GROUP="gracecall-rg"
LOCATION="eastus"
ACR_NAME="gracecallacr"       # globally unique, lowercase, 5-50 alphanumeric chars
APP_NAME="grace-call"
ENV_NAME="gracecall-env"
IMAGE_TAG="latest"
# -----------------------------------------------------------------------------

IMAGE_REF="${ACR_NAME}.azurecr.io/${APP_NAME}:${IMAGE_TAG}"

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║   GraceCall → Azure Container Apps deployment        ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "Resource group : ${RESOURCE_GROUP}"
echo "Location       : ${LOCATION}"
echo "ACR            : ${ACR_NAME}"
echo "Container App  : ${APP_NAME}"
echo "Environment    : ${ENV_NAME}"
echo "Image          : ${IMAGE_REF}"
echo ""

# Verify the caller is logged in
echo "──────────────────────────────────────────────────────"
echo "▶ Checking Azure login..."
az account show --query "{subscription:name, id:id}" -o table
echo ""

# Register required providers (idempotent — safe to run more than once)
echo "──────────────────────────────────────────────────────"
echo "▶ Registering Azure resource providers (this can take ~60s on first run)..."
az provider register --namespace Microsoft.App        --wait &
az provider register --namespace Microsoft.ContainerRegistry --wait &
az provider register --namespace Microsoft.OperationalInsights --wait &
wait
echo "   Providers ready."
echo ""

# -----------------------------------------------------------------------------
# 1. Resource group
# -----------------------------------------------------------------------------
echo "──────────────────────────────────────────────────────"
echo "▶ Step 1/8 — Create resource group..."
az group create \
  --name "${RESOURCE_GROUP}" \
  --location "${LOCATION}" \
  --output table
echo ""

# -----------------------------------------------------------------------------
# 2. Azure Container Registry
# -----------------------------------------------------------------------------
echo "──────────────────────────────────────────────────────"
echo "▶ Step 2/8 — Create Azure Container Registry (Basic SKU)..."
az acr create \
  --name "${ACR_NAME}" \
  --resource-group "${RESOURCE_GROUP}" \
  --sku Basic \
  --admin-enabled true \
  --output table
echo ""

# -----------------------------------------------------------------------------
# 3. Build & push image — local Docker build (works on Azure for Students,
#    which blocks ACR Tasks cloud builds). Requires Docker Desktop running.
# -----------------------------------------------------------------------------
echo "──────────────────────────────────────────────────────"
echo "▶ Step 3/8 — Build + push Docker image (local Docker)..."
echo "   Source: $(pwd)"
echo "   Image:  ${IMAGE_REF}"

if ! command -v docker >/dev/null 2>&1; then
  echo "❌ Docker is not installed. Install Docker Desktop from https://docs.docker.com/desktop/install/mac-install/ and re-run."
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo "❌ Docker daemon is not running. Open Docker Desktop and wait for it to start, then re-run."
  exit 1
fi

az acr login --name "${ACR_NAME}"
# --platform linux/amd64 is required on Apple Silicon — Container Apps runs amd64.
docker build --platform linux/amd64 -t "${IMAGE_REF}" .
docker push "${IMAGE_REF}"
echo ""

# -----------------------------------------------------------------------------
# 4. Container Apps environment
# -----------------------------------------------------------------------------
echo "──────────────────────────────────────────────────────"
echo "▶ Step 4/8 — Create Container Apps environment..."
az containerapp env create \
  --name "${ENV_NAME}" \
  --resource-group "${RESOURCE_GROUP}" \
  --location "${LOCATION}" \
  --output table
echo ""

# -----------------------------------------------------------------------------
# 5. Fetch ACR credentials
# -----------------------------------------------------------------------------
echo "──────────────────────────────────────────────────────"
echo "▶ Step 5/8 — Fetching ACR credentials..."
ACR_USERNAME=$(az acr credential show \
  --name "${ACR_NAME}" \
  --resource-group "${RESOURCE_GROUP}" \
  --query username -o tsv)

ACR_PASSWORD=$(az acr credential show \
  --name "${ACR_NAME}" \
  --resource-group "${RESOURCE_GROUP}" \
  --query "passwords[0].value" -o tsv)

echo "   ACR username: ${ACR_USERNAME}"
echo "   ACR password: [hidden]"
echo ""

# -----------------------------------------------------------------------------
# 6. Create the Container App
# -----------------------------------------------------------------------------
echo "──────────────────────────────────────────────────────"
echo "▶ Step 6/8 — Creating Container App..."
az containerapp create \
  --name "${APP_NAME}" \
  --resource-group "${RESOURCE_GROUP}" \
  --environment "${ENV_NAME}" \
  --image "${IMAGE_REF}" \
  --registry-server "${ACR_NAME}.azurecr.io" \
  --registry-username "${ACR_USERNAME}" \
  --registry-password "${ACR_PASSWORD}" \
  --ingress external \
  --target-port 8080 \
  --transport http \
  --min-replicas 1 \
  --max-replicas 3 \
  --cpu 0.5 \
  --memory 1.0Gi \
  --env-vars \
    NODE_ENV=production \
    PORT=8080 \
  --output table
echo ""

# -----------------------------------------------------------------------------
# 7. Get the deployed FQDN
# -----------------------------------------------------------------------------
echo "──────────────────────────────────────────────────────"
echo "▶ Step 7/8 — Retrieving deployed URL..."
FQDN=$(az containerapp show \
  --name "${APP_NAME}" \
  --resource-group "${RESOURCE_GROUP}" \
  --query "properties.configuration.ingress.fqdn" \
  -o tsv)

APP_URL="https://${FQDN}"
echo "   FQDN : ${FQDN}"
echo "   URL  : ${APP_URL}"
echo ""

# -----------------------------------------------------------------------------
# 8. Health check (optional — exits 0 even if the app needs secrets first)
# -----------------------------------------------------------------------------
echo "──────────────────────────────────────────────────────"
echo "▶ Step 8/8 — Quick health probe (expecting 200 or 401 — not a crash)..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 "${APP_URL}/health" || true)
if [[ "${HTTP_STATUS}" == "200" || "${HTTP_STATUS}" == "401" || "${HTTP_STATUS}" == "404" ]]; then
  echo "   Container is responding (HTTP ${HTTP_STATUS}). ✅"
else
  echo "   Container returned HTTP ${HTTP_STATUS} — secrets may be missing (normal at this stage)."
fi
echo ""

# -----------------------------------------------------------------------------
# ✅ Summary
# -----------------------------------------------------------------------------
echo "╔══════════════════════════════════════════════════════════════════════╗"
echo "║  ✅  Deployment complete!                                            ║"
echo "╚══════════════════════════════════════════════════════════════════════╝"
echo ""
echo "  🌐  App URL: ${APP_URL}"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  NEXT STEPS — you must complete these for the app to function:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  1️⃣   Set all secrets (copy scripts/set-secrets.sh.example, fill in values,"
echo "       then run it):"
echo ""
echo "       cp scripts/set-secrets.sh.example scripts/set-secrets.sh"
echo "       # Edit scripts/set-secrets.sh with real values"
echo "       bash scripts/set-secrets.sh"
echo ""
echo "  2️⃣   Update CALLBACK_BASE_URL to point at this Container App:"
echo ""
echo "       az containerapp update \\"
echo "         --name ${APP_NAME} \\"
echo "         --resource-group ${RESOURCE_GROUP} \\"
echo "         --set-env-vars CALLBACK_BASE_URL=${APP_URL}"
echo ""
echo "  3️⃣   Update servers[0].url in BOTH OpenAPI spec files:"
echo ""
echo "       # azure-foundry/openapi-foundry.yaml"
echo "       # copilot-studio/openapi.yaml"
echo "       # Change the 'url:' line under 'servers:' to: ${APP_URL}"
echo ""
echo "  4️⃣   (Optional) Enable WebSocket keep-alive for ACS media streaming:"
echo "       Azure Portal → Container App → Settings → Ingress"
echo "       → Enable 'WebSocket support'"
echo ""
echo "  5️⃣   Set AUTO_DIAL=0 in env vars (Power Automate will be the dialer):"
echo "       Already set if you copied from .env. Confirm with:"
echo "       az containerapp show --name ${APP_NAME} --resource-group ${RESOURCE_GROUP} \\"
echo "         --query 'properties.template.containers[0].env' -o table"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  REDEPLOY after code changes:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "       az acr build --registry ${ACR_NAME} --image ${APP_NAME}:latest ."
echo "       az containerapp update --name ${APP_NAME} \\"
echo "         --resource-group ${RESOURCE_GROUP} \\"
echo "         --image ${IMAGE_REF}"
echo ""
