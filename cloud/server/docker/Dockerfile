FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --production

COPY dist/ ./dist/

RUN mkdir -p /app/data/files /app/data/db

EXPOSE 3000

CMD ["node", "dist/index.js"]