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

# Create persistent storage directory with proper permissions
RUN mkdir -p /data/session && \
    chmod 777 /data/session

# Symlink session directory to persistent storage
RUN rm -rf session && ln -s /data/session session

# Ensure proper ownership
RUN chown -R node:node /app /data/session

# Switch to non-root user
USER node

# Start the bot
CMD ["node", "index.js"]