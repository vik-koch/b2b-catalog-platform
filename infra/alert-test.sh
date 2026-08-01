#!/usr/bin/env bash
# Sends one test mail through a stack's configured alert SMTP, so you find out
# the channel works *before* an alert needs it.
#
# Alerting is the one feature that is silent when correct and silent when
# broken. Grafana logs a notify error and carries on, so a wrong host, a blocked
# port or a rejected sender look exactly like a quiet week.
#
# Usage:
#   infra/alert-test.sh <host> <stack>
# e.g.
#   infra/alert-test.sh 1.2.3.4 prod
#
# Reads the SMTP settings from the VM's own observability .env, so it tests the
# credentials the alerts will actually use — not a copy that may have drifted.
#
# SSH: same contract as deploy.sh — connects as "deploy", key via ssh-agent /
# ssh config / SSH_OPTS.
set -euo pipefail

host=${1:?usage: alert-test.sh <host> <stack>}
stack=${2:?usage: alert-test.sh <host> <stack>}

run() { ssh ${SSH_OPTS:-} "deploy@$host" "$@"; }

# The env lives beside the observability compose file, one per VM.
remote_env=/srv/b2b/observability/.env
run "test -f $remote_env" || {
  echo "no $remote_env on $host — is the observability stack deployed?" >&2
  exit 1
}

# Read the file once and parse locally: a value with a space in it (a display
# name, a password) survives that, where a shell-split of remote output does
# not. The password only ever lives in this process's memory.
env_content=$(run "cat $remote_env")
val() { printf '%s\n' "$env_content" | sed -n "s/^$1=//p" | head -1 | tr -d '\r'; }

smtp_host=$(val SMTP_HOST)
smtp_user=$(val SMTP_USER)
smtp_pass=$(val SMTP_PASSWORD)
smtp_from=$(val SMTP_FROM)
alert_to=$(val ALERT_EMAIL)
skip_verify=$(val SMTP_SKIP_VERIFY)

[ -n "$smtp_host" ] && [ -n "$alert_to" ] || {
  echo "alerting is not configured on '$stack' (SMTP_HOST / ALERT_EMAIL empty)." >&2
  echo "See infra/observability/.env.example." >&2
  exit 1
}

echo "==> Sending a test alert via $smtp_host to $alert_to"

# curl speaks SMTP, so this needs nothing installed on the VM beyond the image
# the stack already pulls. --ssl-reqd upgrades with STARTTLS; providers on 465
# want smtps:// instead, which the URL below picks up from the port.
scheme=smtp
case "$smtp_host" in *:465) scheme=smtps ;; esac
# Mirror what Grafana is configured to do, so this tests the same thing:
# require TLS by default, tolerate a self-signed relay when the stack does.
tls_opts=--ssl-reqd
[ "$skip_verify" = "true" ] && tls_opts="--insecure" 

run "docker run --rm -i curlimages/curl:latest \
  --silent --show-error $tls_opts \
  --url '$scheme://$smtp_host' \
  ${smtp_user:+--user '$smtp_user:$smtp_pass'} \
  --mail-from '$smtp_from' --mail-rcpt '$alert_to' \
  --upload-file - <<'MAIL'
From: $smtp_from
To: $alert_to
Subject: [$stack] alert channel test

This is infra/alert-test.sh confirming that alerts from the '$stack' stack can
reach this address. If you are reading it, disk / backup / error alerts will
arrive here too.
MAIL"

echo
echo "Sent. If nothing arrives, check the sender is allowed to relay and that"
echo "the VM can reach ${smtp_host} outbound (some providers block port 25)."
