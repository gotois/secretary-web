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
