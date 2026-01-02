FROM node:22-slim

WORKDIR /app

COPY package*.json ./

RUN npm install
RUN npm install socket.io-client

COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host"]
