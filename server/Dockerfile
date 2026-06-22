FROM node:22-alpine

RUN apk add --no-cache openssl && \
    mkdir -p /app/certs && \
    openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:P-256 \
      -keyout /app/certs/key.pem -out /app/certs/cert.pem \
      -days 3650 -nodes -subj "/CN=syncscreen.local"

WORKDIR /app

COPY server/package*.json ./
RUN npm ci --omit=dev

COPY server/ .

COPY panel/ /panel/

EXPOSE 3001
EXPOSE 3002

CMD ["node", "server.js"]
