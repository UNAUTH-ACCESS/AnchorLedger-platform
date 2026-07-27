# Stage 1 — build React production bundle
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
# 768MB, not 2048MB - the VPS this builds on has only 1.9GB total RAM, with
# postgres/api/worker/dockerd and unrelated services already using most of
# it under normal operation. Allowing Node to try growing toward 2GB during
# a build guaranteed severe swap thrashing (swap fully exhausted, SSH
# connection dropping mid-build) rather than actually helping - a lower,
# realistic ceiling forces more frequent GC instead of thrashing.
RUN NODE_OPTIONS="--max-old-space-size=768" npm run build

# Stage 2 — serve with Nginx
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
