FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY agents/orchestrator/ ./agents/orchestrator/
CMD ["node", "agents/orchestrator/index.js", "daemon"]
