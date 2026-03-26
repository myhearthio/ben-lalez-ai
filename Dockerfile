FROM node:22-slim

WORKDIR /app
COPY . ./
RUN cd dashboard && npm install && npm run build && cd ..
RUN npm ci --omit=dev
RUN npm install -g serve

COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh

CMD ["/app/start.sh"]
