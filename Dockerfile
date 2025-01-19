FROM node:18-slim

WORKDIR /app

# Install required packages
RUN apt-get update && \
    apt-get install -y \
    git \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy project files
COPY . .

# Create persistent storage directory
RUN mkdir -p /data/session

# Symlink session directory to persistent storage
RUN rm -rf session && ln -s /data/session session

# Start the bot
CMD ["node", "index.js"]