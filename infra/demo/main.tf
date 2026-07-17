terraform {
  required_version = ">= 1.9"

  # State backend: HCP Terraform (free tier). The workspace's execution mode
  # must be set to "Local" so applies run in GitHub Actions / on the
  # workstation (where HCLOUD_TOKEN etc. exist) and HCP only stores state.
  cloud {
    organization = "vikkoch"
    workspaces {
      name = "b2b-demo"
    }
  }

  required_providers {
    hcloud = {
      source  = "hetznercloud/hcloud"
      version = "~> 1.50"
    }
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
  }
}

# Credentials come from the environment, never from variables:
# HCLOUD_TOKEN (Hetzner) and CLOUDFLARE_API_TOKEN (Cloudflare).
provider "hcloud" {}
provider "cloudflare" {}

locals {
  name = "b2b-demo-${var.demo_id}"
  fqdn = "${local.name}.${var.domain}"
}

resource "hcloud_ssh_key" "deploy" {
  name       = "${local.name}-deploy"
  public_key = file("${path.module}/../keys/deploy.pub")
}

resource "hcloud_firewall" "demo" {
  name = local.name

  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "22"
    source_ips = ["0.0.0.0/0", "::/0"]
  }

  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "80"
    source_ips = ["0.0.0.0/0", "::/0"]
  }

  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "443"
    source_ips = ["0.0.0.0/0", "::/0"]
  }

  rule {
    direction  = "in"
    protocol   = "icmp"
    source_ips = ["0.0.0.0/0", "::/0"]
  }
}

resource "hcloud_server" "demo" {
  name         = local.name
  server_type  = var.server_type
  image        = var.image
  location     = var.location
  ssh_keys     = [hcloud_ssh_key.deploy.id]
  firewall_ids = [hcloud_firewall.demo.id]
  user_data    = file("${path.module}/../cloud-init.yml")
}

resource "cloudflare_dns_record" "demo" {
  zone_id = var.cloudflare_zone_id
  name    = local.fqdn
  type    = "A"
  content = hcloud_server.demo.ipv4_address
  ttl     = 60
  # DNS-only (grey cloud): Traefik terminates TLS itself via Let's Encrypt
  # HTTP-01, which the Cloudflare proxy would break.
  proxied = false
}
