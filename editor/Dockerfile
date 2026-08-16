# Build context is the REPO ROOT (see docker-compose.yml) because the editor
# depends on the local @forms-engine/renderer package.
FROM node:24-alpine AS build
WORKDIR /repo

# Build the shared renderer package first.
COPY package.json package-lock.json* ./
COPY packages/renderer/package.json packages/renderer/
COPY packages/react/package.json packages/react/
COPY packages/angular/package.json packages/angular/
RUN npm install --workspace @forms-engine/renderer --ignore-scripts
COPY packages/renderer packages/renderer
RUN npm run build -w @forms-engine/renderer

# Then the editor app.
COPY editor/package.json editor/
RUN cd editor && npm install --ignore-scripts
COPY editor editor
RUN cd editor && npx ng build

FROM nginx:1.27-alpine
COPY editor/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/editor/dist/forms-engine/browser /usr/share/nginx/html
# Self-hosted single-file embed bundle, handy for local embedding demos.
COPY --from=build /repo/packages/renderer/dist/forms-engine.esm.js /usr/share/nginx/html/embed/forms-engine.esm.js
COPY editor/docker-entrypoint.sh /docker-entrypoint.d/40-forms-engine-config.sh
RUN chmod +x /docker-entrypoint.d/40-forms-engine-config.sh
EXPOSE 80
