# 0005 — One shared Traefik reverse proxy per VM

**Status:** accepted · **Date:** 2026-07-17

## Context

NFR-OPS-02 requires independent dev and prod environments. The
requirement is itself a choice worth a word: with one developer it is not
strictly necessary — but trunk-based auto-deploys need a target that is
allowed to break, deploys and migrations should fail on prod-like
infrastructure the client does not own, and demonstrating the practice is
part of this project's purpose. This ADR is what makes the separation
nearly free.

For cost both environments share one VM, so both stacks (and demo stacks
with a different hostname every run) must be reachable on ports 80/443
with TLS. Something must route by hostname and manage Let's Encrypt
certificates. Alternatives: nginx + certbot, one proxy per stack on
juggled ports, or a cloud load balancer.

## Decision

A single Traefik instance per VM (its own compose stack,
`infra/traefik/`), attached to a shared docker network. App stacks
self-register their routing and TLS via container labels; certificates
come from Let's Encrypt over HTTP-01.

## Rationale

1. **Label-based dynamic configuration.** Adding, removing, or renaming a
   stack — including the per-run demo hostnames — touches no central
   proxy config and requires no reload. With nginx, every stack and every
   demo run would mean templating a server block and reloading.
2. **Built-in ACME lifecycle.** Issuance, renewal, and storage are
   Traefik configuration, replacing a certbot install, its cron, and
   reload hooks per hostname.
3. **Port juggling avoided.** One entrypoint owns 80/443; stacks stay on
   internal networks with no published ports, which also keeps Postgres
   unreachable from outside.

The same middleware layer later carries rate limiting on auth endpoints
(NFR-SEC scope) without new infrastructure.

## Consequences

- (+) N environments on one VM behind one proxy, TLS fully automatic.
- (−) The proxy is a shared single point of failure for every stack on
  the VM — accepted, the VM itself already is one.
- (−) Traefik reads the (read-only) Docker socket, and its Docker
  integration couples proxy and engine versions — Docker Engine 29
  required Traefik ≥ 3.6.1, hence the pinned major.minor.
