# ---------- build stage ----------
# Angular 21 requires Node ^20.19 || ^22.12 || >=24
FROM node:22-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
# @angular/animations@20 is pinned next to @angular/core@21 -> peer-dep conflict,
# so install with --legacy-peer-deps (same as lockfile was produced with)
RUN npm ci --legacy-peer-deps --no-audit --no-fund

COPY . .

RUN npm run build -- --configuration production

# ---------- runtime stage ----------
FROM nginx:alpine

# @angular/build:application outputs to dist/<project>/browser
COPY --from=build /app/dist/frontend/browser /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
