# syntax=docker/dockerfile:1
#
# Two stages: build the bundle, then serve it. The final image contains no Node, no toolchain, no
# source and no secret — an SPA is static files, and everything else in the image is attack surface
# for something it does not need to do.
#
# THE IMAGE CARRIES NO ENVIRONMENT. It is built once, tagged once, and the same tag is promoted from
# staging to production; the hosts it talks to are resolved in the browser from the address the page
# was served on (src/lib/hosts.ts). There is deliberately no build arg for an API URL, and there is
# no build arg for the stratum hostname either — which is the one this surface would be tempted by,
# since handing out that hostname is its whole purpose. It is derived from the page address for the
# same reason everything else is.
#
# THERE IS ALSO NO SERVICE TOKEN IN THIS IMAGE, AND THAT IS THE HARDER RULE. It is not needed: every
# micro-pool route this bundle calls is anonymous (`pool/src/server.ts`) and the client presents
# nothing. The rule survives the reason, because the reflex it guards against does not depend on it
# — an image is built once and promoted, pushed to a registry and pulled by anything with read
# access, so a credential inside one is a published credential whatever it was for. `nginx.conf`
# proxies nothing and CI greps both files.

# The named context is the unpublished @cloudsforge/ui workspace, mirroring the `link:` specifier in
# package.json. It disappears when the package is published; see the README.
#   docker build -t pool-web --build-context uipkg=../ui .

FROM node:22-alpine AS build
WORKDIR /app

RUN corepack enable

# The linked package must exist before `pnpm install` resolves the `link:` dependency, and it is
# copied first because it changes far less often than this app's source.
COPY --from=uipkg packages/ui /ui/packages/ui
# esbuild reads the nearest tsconfig for each file it transforms, and the design system's extends the
# one at its repository root. Without it the build fails inside a file this app does not own.
COPY --from=uipkg tsconfig.base.json /ui/tsconfig.base.json

# pnpm-workspace.yaml carries the esbuild build-script allowance; without it the toolchain installs
# and then cannot run.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src

# ══════════════════════════════════════════════════════════════════════════════════════════════
# public/ — THE LINE THAT ONCE WAS NOT IN THE TEMPLATE.
#
# Vite copies `publicDir` into `dist` during the build, so the favicons and the og card only reach
# the image if they are in the build context. The web template's Dockerfile used to copy tsconfig,
# vite.config, index.html and src — and not public — so every frontend cut from it built an image
# whose `dist/` had no favicon in it, while `brand-chrome.test.ts` went on passing because it reads
# the SOURCE tree. Four frontends shipped that way: icons wired, committed, tested, and absent from
# the artefact actually served.
#
# It is fixed upstream now, and this line was copied only after `micro-web-template/Dockerfile` was
# opened and read — not on the strength of a sibling's comment saying so. Both
# `test/brand-chrome.test.ts` (which reads this file) and the image probe in ci.yml (which curls the
# running container for each asset) fail without it.
# ══════════════════════════════════════════════════════════════════════════════════════════════
COPY public ./public

# The release identity: the git sha, stamped into the meta tag src/lib/obs.ts reads, so an error
# report names the deploy that produced it. It identifies the artefact; it does not configure it.
ARG RELEASE=dev
RUN sed -i "s|name=\"cf-release\" content=\"dev\"|name=\"cf-release\" content=\"${RELEASE}\"|" index.html \
 && pnpm build

# nginx-unprivileged: the server runs as uid 101 and listens on 8080. A static file server has no
# reason to be root, and a container that cannot become root cannot be made to write anywhere.
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf

# ══════════════════════════════════════════════════════════════════════════════════════════════
# THE ONE FILE IN THIS IMAGE THAT IS NOT THE SAME ON EVERY DEPLOYMENT — AND IT STILL IS NOT
# BUILT-TIME CONFIGURATION.
#
# The image is built once and promoted; nothing above reads an environment. This template is
# expanded by the stock entrypoint (`/docker-entrypoint.d/20-envsubst-on-templates.sh`) into
# `/etc/nginx/conf.d/deployment.inc` when the CONTAINER starts, from `POOL_API_PRESENCE` in its
# environment, and `nginx.conf` includes it inside `location = /deployment.json`. So the artefact
# CI examined is byte-for-byte the artefact that runs, and the one fact that differs between a
# mainnet estate and a testnet one — whether there is a micro-pool behind this console at all
# (micro-org#406) — arrives the way every other deploy fact does.
#
# `.inc` and not `.conf` on purpose: the output directory is `conf.d`, which the packaged
# nginx.conf includes as `*.conf`, so a `.conf` here would become a second `server` block on 8080.
# The argument in full, including why nginx.conf itself is copied verbatim rather than templated,
# is in nginx.conf under "IS THERE A POOL API ON THIS DEPLOYMENT AT ALL?".
# ══════════════════════════════════════════════════════════════════════════════════════════════
COPY deployment.inc.template /etc/nginx/templates/deployment.inc.template

# ── AND THE DEFAULT, WHICH IS NOT OPTIONAL AND WAS FOUND BY RUNNING THE IMAGE ────────────────────
#
# MEASURED 2026-08-11, building this image and starting it with no environment: the container
# EXITED 1 with `nginx: [emerg] unknown "pool_api_presence" variable`.
#
# The entrypoint does not substitute every `${...}` it finds. It builds its list from the variables
# that are actually SET — `envsubst "$defined_envs"` over `printenv | cut -d= -f1` — so an unset
# variable is left in the output verbatim, `${POOL_API_PRESENCE}` reaches nginx as an nginx variable
# reference, nginx has never heard of it, and the config fails to parse. Not a wrong document: no
# server at all. Every deployment that had never heard of this flag — mainnet included — would have
# gone down on the deploy that shipped it, and nothing about the Dockerfile or the template says so.
#
# `ENV` rather than a default inside the template, because there is no `${VAR:-default}` in
# envsubst: it implements only `$VAR` and `${VAR}`. This is the one place the default can live.
#
# `present` and not the empty string. Both read as "there is a pool here" (`src/lib/deployment.tsx`
# treats only the exact string `absent` as absence, and everything else — including `""` — as
# presence), but a document that says `{"poolApi":"present"}` states the assumption an operator is
# looking at, where an empty field looks like the mechanism is broken.
ENV POOL_API_PRESENCE=present

# Into a folder, because the surface is one — `/pool`, matching `base:` in vite.config.ts and
# every `location` in nginx.conf. A bundle built for `/pool/assets/…` and copied to the document
# root 404s on every asset while `GET /` answers 200 with a shell that cannot start.
COPY --from=build /app/dist /usr/share/nginx/html/pool

EXPOSE 8080

# Liveness only. It proves nginx is answering, not that the app works — and on this surface it is
# especially narrow: the thing a miner actually connects to is a raw TCP listener in a DIFFERENT
# container on a different port, which this one cannot see and must not claim to speak for.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
