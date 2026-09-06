#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${ROOT_PASSWORD:-}" ]]; then
  echo "ROOT_PASSWORD is missing" >&2
  exit 1
fi

printf 'root:%s\n' "$ROOT_PASSWORD" | chpasswd

install -d -m 0755 /etc/ssh/sshd_config.d
cat >/etc/ssh/sshd_config.d/00-azure-vps-starter.conf <<'CFG'
PermitRootLogin yes
PasswordAuthentication yes
CFG

if command -v sshd >/dev/null 2>&1; then
  sshd -t
fi

if command -v systemctl >/dev/null 2>&1; then
  systemctl reload ssh 2>/dev/null \
    || systemctl reload sshd 2>/dev/null \
    || systemctl restart ssh 2>/dev/null \
    || systemctl restart sshd 2>/dev/null
fi
