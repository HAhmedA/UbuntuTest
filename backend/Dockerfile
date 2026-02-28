# Simple Node image to run the Express backend
FROM node:18-alpine
WORKDIR /app

# Install curl for production health check
RUN apk add --no-cache curl

# Install only runtime dependencies
COPY package.json ./
RUN npm install --only=production --no-audit --no-fund

# Copy application source
COPY . .

ENV PORT=8080
EXPOSE 8080
# Run migrations then start the app
CMD ["sh", "-c", "npm run migrate && node server.js"]

