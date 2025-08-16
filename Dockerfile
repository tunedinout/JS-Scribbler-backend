FROM node:20-slim

WORKDIR /app

COPY package*.json ./
# RUN npm install
RUN npm install --production
#remove this in prod
RUN npm install -g nodemon

COPY . .
#remove thisi n prod
EXPOSE 3000
CMD ["nodemon", "src/index.js"]
# EXPOSE 8080
# CMD ["npm", "start"]
