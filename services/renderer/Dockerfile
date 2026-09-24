FROM mcr.microsoft.com/playwright:v1.52.0-noble@sha256:a021500a801bab0611049217ffad6b9697d827205c15babb86a53bc1a61c02d5
WORKDIR /app
USER root
RUN apt-get update && apt-get install -y --no-install-recommends iptables && rm -rf /var/lib/apt/lists/*
COPY package.json ./
COPY package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY server.mjs ./
COPY test ./test
COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh
ENV PORT=8080
EXPOSE 8080
ENTRYPOINT ["/app/entrypoint.sh"]
