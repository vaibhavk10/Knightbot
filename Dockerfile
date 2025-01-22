# Use the official Node.js slim image
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
RUN npm install --unsafe-perm

# Copy project files
COPY . .

# Create session directory with full permissions
RUN mkdir -p session && chmod -R 777 session

# Expose the health check port
EXPOSE 7860

# Start the bot
CMD ["node", "index.js"]
