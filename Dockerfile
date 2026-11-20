FROM node:22-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg python3 python3-pip ca-certificates tini \
 && pip3 install --no-cache-dir --break-system-packages "yt-dlp[default]" \
 && apt-get purge -y python3-pip && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
COPY src ./src
COPY public ./public

ENV HOST=0.0.0.0 PORT=8765 GECICI=/tmp/yt-indirici NODE_ENV=production XDG_CACHE_HOME=/tmp/.cache
USER node
EXPOSE 8765
HEALTHCHECK --interval=60s --timeout=5s CMD node -e "fetch('http://127.0.0.1:8765/saglik').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "src/sunucu.js"]
