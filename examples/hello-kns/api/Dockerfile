# API image for the hello-kns reference module. The build harness (tooling/build-example.ts) supplies
# server.mjs and the org.kns.* / org.opencontainers.* labels from module.json.
# The base image is pinned by digest; update it deliberately, never implicitly.
FROM node:24-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6
WORKDIR /app
COPY --chmod=0444 server.mjs /app/server.mjs
ENV NODE_ENV=production
# Non-root and read-only-root friendly: the process writes nothing outside /tmp.
USER 10001:10001
EXPOSE 8080
CMD ["node", "/app/server.mjs"]
