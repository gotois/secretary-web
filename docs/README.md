# Secretary Server

> Your personal assistant: diary watcher, life analyzer, and task manager.

[![Website](https://img.shields.io/website/https/prosto-diary.gotointeractive.com.svg?link=https://prosto-diary.gotointeractive.com)](https://prosto-diary.gotointeractive.com)
[![Known Vulnerabilities](https://snyk.io/test/github/gotois/secretary-tg/badge.svg)](https://snyk.io/test/github/gotois/secretary-tg)
[![codecov](https://codecov.io/gh/gotois/secretary-tg/branch/master/graph/badge.svg)](https://codecov.io/gh/gotois/secretary-tg)
[![Maintainability](https://api.codeclimate.com/v1/badges/709ebb5f0eae1d062e5e/maintainability)](https://codeclimate.com/github/gotois/secretary-tg/maintainability)
![GitHub code size in bytes](https://img.shields.io/github/languages/code-size/gotois/secretary-tg.svg?style=popout)
![GitHub repo size](https://img.shields.io/github/repo-size/gotois/secretary-tg.svg)
![Docker Image](https://img.shields.io/docker/image-size/qertis/secretary-tg)
[![GitHub commit activity](https://img.shields.io/github/commit-activity/m/gotois/secretary-tg.svg)](https://github.com/gotois/secretary-tg/commits/master)
[![License: Common Public License Version 1.0](https://img.shields.io/badge/License-CPL-blue.svg)](https://github.com/gotois/secretary-tg/blob/master/LICENSE)
[![Issuehunt](https://img.shields.io/badge/issuehunt.io-blueviolet.svg?link=https://issuehunt.io/r/gotois/secretary-tg&style=flat&label=jobs)](https://issuehunt.io/r/gotois/secretary-tg)

Install
---

> Dev only

```bash
npm i
chmod +x scripts/prepare
scripts/prepare
```

> For HTTPS

Add host `/etc/hosts` for local development

```text
127.0.0.1       tg-dev.gotointeractive.com
```

```bash
mkdir cert;
openssl req -x509 -newkey rsa:2048 \
  -keyout certs/server/bot-key.pem \
  -out certs/server/bot-cert.pem \
  -days 365 -nodes \
  -subj "/CN=tg-dev.gotointeractive.com" \
  -addext "subjectAltName=DNS:tg-dev.gotointeractive.com"
```

For MacOS add certificate to trusted

```bash
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain certs/server/bot-cert.pem
```

Run dev server

```bash
npm run dev:secure
```

### ENVIRONMENTS

Copy `.env.example` to `.env` and fill in the required values. Do not commit `.env`.

Required values: `TELEGRAM_TOKEN`, `HOST`, `SECRETARY_HOST`, `APP_URL`, `CLIENT_ID`, and `CLIENT_SECRET`.

## Tests

### Unit

```bash
npm run test:unit [-- --watch]
#npm run test:unit [-- --match='config']
```

Run the full package check:

```bash
npm run test
```

## Tools

### Package upgrade

```bash
ncu -u
```

### Secretary API types

`SecretaryGateway` imports generated types from the package root `api.d.ts`.
They are generated from the checked-in OpenAPI snapshot at
`openapi/secretary.json`; `redocly.yaml` defines the input and output. The
generated file is ignored by Git, and the types stay at the infrastructure
boundary instead of entering the domain layer.

Run these commands from the standalone TG repository root:

```bash
npm install --ignore-scripts
npm run generate:api
npm run check:api
npm run lint
```

Generation uses the checked-in snapshot and does not need the private Secretary
core, a parent repository, a running server, a database, Docker, or network
access. Node 26 strips erasable TypeScript syntax when running the source, but
does not perform static type checking. `check:api` checks that an existing
`api.d.ts` matches the snapshot without writing files; run `generate:api` first
from a clean checkout.

To update the API contract, obtain the OpenAPI JSON for the agreed API version
from its provider, replace `openapi/secretary.json`, then run `generate:api`,
`check:api`, and lint. Review the snapshot and the locally generated types.
Commit the snapshot; regenerate `api.d.ts` when needed. A core
release can change API descriptions; TG owns its snapshot and updates it
deliberately when adopting a compatible API.

JSON-RPC parameter and result schemas are supplied by the API contract. Results
for methods without a specific schema, and responses requested with arbitrary
`Accept` headers, remain `unknown`. These compile-time types do not validate
external responses at runtime.

#### Fix lint

```bash
npm run lint -- --fix --quite
```

#### Show dependencies graph

`report:dependency` uses Graphviz `dot` to render the dependency-cruiser DOT output to SVG.
Install Graphviz first and make sure `dot` is available in `PATH`.

```bash
# macOS
brew install graphviz
npm run report:dependency
```

#### Validate dependencies

```bash
npm run lint:dependency
```

#### docs only Dev

Install

```bash
sudo gem install bundler jekyll
cd docs
bundle install
```

Run

```bash
npm run dev:docs
```

## Docker Image

```bash
docker compose --env-file .env up --build
```

### Run Telegram Bot Dev

```bash
docker compose --env-file .env up -d
```

Возможности управления системой

1. `something text` - Уведомление
2. `? something search` - Поиск
3. `! something execute` - Выполнение поручения

---

Make with [Manifest GIC DAO](https://gotointeractive.com/manifest).
