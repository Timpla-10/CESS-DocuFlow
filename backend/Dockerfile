# Use Node.js 24
FROM node:24-alpine

# Set the working directory
WORKDIR /app

# Set production environment
ENV NODE_ENV=production

# Copy dependency files
COPY package*.json ./

# Install production dependencies
RUN npm ci --omit=dev

# Copy backend source code
COPY --chown=node:node . .

# Use a non-root user
USER node

# Backend API port
EXPOSE 5000

# Start the Express server
CMD ["npm", "start"]