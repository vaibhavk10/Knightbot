# Use Node.js 18 slim image
FROM node:18-slim

WORKDIR /app

# Install required packages including DNS utilities
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    git \
    python3 \
    make \
    g++ \
    dnsutils \
    iputils-ping \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Set DNS to Google and Cloudflare inside the container
RUN echo "nameserver 8.8.8.8\nnameserver 1.1.1.1" > /etc/resolv.conf

# Copy package files
COPY package*.json ./

# Install dependencies with --unsafe-perm flag to prevent permission issues
RUN npm install --unsafe-perm

# Copy project files
COPY . .

# Create session directory with proper permissions
RUN mkdir -p session && chmod -R 777 session

# Expose health check port
EXPOSE 7860

# Set environment variables for DNS resolution
ENV NODE_DNS_SERVERS="8.8.8.8,1.1.1.1"

# Start the bot
CMD ["node", "index.js"]
