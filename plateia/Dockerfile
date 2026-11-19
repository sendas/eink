FROM node:22-alpine
WORKDIR /app
COPY package.json server.js cli.js ./
COPY lib ./lib
COPY public ./public
# HOST=0.0.0.0 obriga a definir PLATEIA_SENHA (o servidor recusa arrancar sem ela).
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8477 PLATEIA_ORIGEM=/media PLATEIA_DADOS=/dados
VOLUME ["/media", "/dados"]
EXPOSE 8477
CMD ["node", "server.js"]
