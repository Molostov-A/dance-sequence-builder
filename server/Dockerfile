FROM node:24-bookworm-slim
WORKDIR /app/server
ARG APP_REVISION=local
ENV APP_REVISION=$APP_REVISION
COPY server/package*.json ./
RUN npm ci --omit=dev && mkdir -p /data && chown node:node /data
COPY --chown=node:node server ./
COPY --chown=node:node js /app/js
COPY --chown=node:node css /app/css
COPY --chown=node:node img /app/img
COPY --chown=node:node index.html /app/index.html
USER node
EXPOSE 8080
CMD ["node", "index.mjs"]
