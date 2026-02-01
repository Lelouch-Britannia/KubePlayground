# Stage 1: Build the Vite React application
FROM node:20-alpine AS build

# Set the working directory inside the container
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./

# Clean cache and install dependencies
RUN npm cache clean --force \
    && npm install --verbose

# Copy the rest of the application code
COPY . .

# Build the Vite application (creates dist/ folder with static assets)
RUN npm run build

# Stage 2: Serve the static files with Nginx
FROM nginx:alpine AS runner

# Create a directory for SSL certificates
RUN mkdir -p /root/nginx-certs \
    && mkdir -p /etc/nginx/sites-available \
    && mkdir -p /etc/nginx/sites-enabled

# Generate self-signed SSL certificates
# hadolint ignore=DL3018
RUN apk add --no-cache openssl && \
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout /root/nginx-certs/nginx-selfsigned.key \
    -out /root/nginx-certs/nginx-selfsigned.crt \
    -subj "/CN=localhost"

# Remove the default Nginx configuration
RUN rm /etc/nginx/conf.d/default.conf

# Copy the custom site configuration for KubePlayground
COPY kubeplayground.conf /etc/nginx/sites-available/kubeplayground.conf

# Create a symbolic link to enable the site configuration
RUN ln -s /etc/nginx/sites-available/kubeplayground.conf /etc/nginx/sites-enabled/kubeplayground.conf

# Copy the global Nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

# Copy the built static files from Vite to Nginx's default directory
COPY --from=build /app/dist /usr/share/nginx/html

# Expose port 80 for HTTP traffic
EXPOSE 80

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]
