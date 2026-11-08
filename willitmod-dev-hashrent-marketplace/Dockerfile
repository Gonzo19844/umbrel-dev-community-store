FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000 DATA_DIR=/app/data
COPY package.json ./
RUN npm install --omit=dev
COPY server.js commerce.js ./
COPY public ./public
RUN node --check server.js && node --check commerce.js && node --check public/app.js && node --check public/admin.js && node --check public/order.js && node --check public/checkout.js
RUN mkdir -p /app/data && chown -R node:node /app
USER node
EXPOSE 3000
CMD ["node", "server.js"]
