FROM node:22-alpine
WORKDIR /app
COPY package.json server.js ./
COPY public ./public
RUN mkdir /data && chown node:node /data
ENV NODE_ENV=production DATA_DIR=/data PORT=3000
VOLUME /data
USER node
EXPOSE 3000
CMD ["node", "server.js"]
