FROM node:lts-buster

# Install dependencies
RUN apt-get update && \
    apt-get install -y ffmpeg webp git && \
    apt-get upgrade -y && \
    rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY yarn.lock ./

# Install dependencies
RUN yarn install --network-concurrency 1

# Copy bot files
COPY . .

# Set permissions
RUN chmod -R 777 .

# Expose port for Hugging Face
EXPOSE 7860

# Set production environment
ENV NODE_ENV=production

# Start the bot
CMD ["node", "index.js"]