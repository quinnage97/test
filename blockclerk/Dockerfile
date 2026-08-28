FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ENV NODE_ENV=production DATA_DIR=/data
EXPOSE 3000
# The wording checks run at boot. A container that would serve a template
# giving advice, or stating unsettled law as settled, does not start.
CMD ["sh", "-c", "node scripts/check.js && node seed.js && node server.js"]
