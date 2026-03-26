FROM node:22-slim
WORKDIR /app
COPY . ./
RUN cd dashboard && npm install && npm run build && cd ..
RUN npm ci --omit=dev
CMD ["node", "agents/orchestrator/index.js", "daemon"]
