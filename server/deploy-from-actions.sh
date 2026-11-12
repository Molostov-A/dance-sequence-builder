#!/usr/bin/env bash
# Устанавливается владельцем в /usr/local/sbin/deploy-dance-sequence-builder.
# SSH authorized_keys: restrict,command="/usr/local/sbin/deploy-dance-sequence-builder".
# Конфигурация контейнера берётся только из защищённого shared/deploy-compose.yaml.
set -euo pipefail
umask 077
base=/opt/dance-sequence-builder
command=${SSH_ORIGINAL_COMMAND:-}
if [[ ! "$command" =~ ^deploy\ ([0-9a-f]{40})$ ]]; then
  echo 'Only deploy <commit-sha> is allowed' >&2
  exit 1
fi
sha=${BASH_REMATCH[1]}
exec 9>"$base/shared/deploy.lock"
flock -w 600 9
release="$base/releases/$(date -u +%Y%m%dT%H%M%SZ)-${sha:0:12}"
mkdir -p "$release"
archive=$(mktemp "$base/shared/release.XXXXXXXX.tar.gz")
trap 'rm -f -- "$archive"' EXIT
# Ограничиваем пакет 20 MiB. Приватные настройки и база в пакет не входят.
head -c 20971521 > "$archive"
test "$(stat -c %s "$archive")" -le 20971520
python3 - "$archive" "$release" <<'PY'
import sys, tarfile, pathlib
archive, destination = sys.argv[1:]
allowed={'index.html','js','css','img','server','tests','compose.yaml','compose.nginx.yaml',
         '.dockerignore','README.md','SERVER_SETUP.md','GOOGLE_DRIVE_SETUP.md','AUTO_DEPLOY.md','AGENTS.md'}
with tarfile.open(archive, 'r:gz') as bundle:
    members=bundle.getmembers()
    if len(members)>5000 or sum(m.size for m in members)>50*1024*1024:
        raise SystemExit('Release is too large')
    for member in members:
        name=pathlib.PurePosixPath(member.name)
        if name.is_absolute() or '..' in name.parts or not name.parts or name.parts[0] not in allowed:
            raise SystemExit('Unsafe release path')
        if not (member.isfile() or member.isdir()) or '.env' in name.parts or 'node_modules' in name.parts:
            raise SystemExit('Links, special files and private configuration are forbidden')
    bundle.extractall(destination, members=members, filter='data')
PY
test -f "$release/server/Dockerfile"
test -f "$release/server/package-lock.json"
chmod -R a+rX "$release"
previous=$(readlink -f "$base/current" 2>/dev/null || true)
previous_sha=$(cat "$base/shared/current-commit" 2>/dev/null || printf local)
export DEPLOY_COMMIT="$sha"
compose=(docker compose -p dance-sequence-builder --project-directory "$release" \
  --env-file "$base/shared/server.env" -f "$base/shared/deploy-compose.yaml")
deployed=true
if ! "${compose[@]}" up -d --build --wait --wait-timeout 120 app; then
  deployed=false
elif ! curl --fail --silent http://127.0.0.1:8088/api/health | python3 -c \
  'import json,sys; result=json.load(sys.stdin); assert result["ok"] and result["revision"]==sys.argv[1]' "$sha"; then
  deployed=false
fi
if [ "$deployed" != true ]; then
  if [ -n "$previous" ]; then
    export DEPLOY_COMMIT="$previous_sha"
    docker compose -p dance-sequence-builder --project-directory "$previous" \
      --env-file "$base/shared/server.env" -f "$base/shared/deploy-compose.yaml" \
      up -d --build --wait --wait-timeout 120 app
  fi
  exit 1
fi
ln -s "$base/shared/server.env" "$release/server/.env"
ln -sfn "$release" "$base/current"
printf '%s\n' "$sha" > "$base/shared/current-commit"
printf 'Deployed commit %s\n' "$sha"
