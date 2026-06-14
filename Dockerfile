# GraceCall service — container for deploying the Azure telephony tool to a public HTTPS host
# (Azure Container Apps / App Service). ACS needs a reachable host for callbacks + media WS.
# Secrets are NEVER baked in — pass them as runtime env vars (see .env.example for the list).
FROM node:20-alpine
WORKDIR /app

# Install deps first for layer caching. npm ci needs the lockfile.
COPY package.json package-lock.json ./
RUN npm ci

# App source (node_modules and .env are excluded via .dockerignore)
COPY . .

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

# Runs via tsx (see package.json "start"). Provide env vars at run time, e.g.:
#   docker run -p 8080:8080 --env-file .env grace-call
CMD ["npm", "start"]
