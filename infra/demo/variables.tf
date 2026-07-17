variable "demo_id" {
  description = "Unique id for this demo instance, becomes part of hostname and DNS record. CI passes the GitHub Actions run_number."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9-]{1,20}$", var.demo_id))
    error_message = "demo_id must be 1-20 chars of lowercase letters, digits or hyphens (it ends up in a hostname)."
  }
}

variable "domain" {
  description = "Zone apex the demo subdomain is created under."
  type        = string
}

variable "cloudflare_zone_id" {
  description = "Cloudflare zone id of var.domain (dashboard -> zone -> Overview, right column). Not a secret."
  type        = string
}

variable "server_type" {
  description = "Hetzner server type. Example: cx23 = 2 vCPU / 4 GB AMD64 — the minimum spec documented in infra/README.md."
  type        = string
}

variable "location" {
  description = "Hetzner location (must offer var.server_type; cx* shared x86 types exist in the EU locations fsn1, nbg1, hel1)."
  type        = string
}

variable "image" {
  description = "OS image. Ubuntu LTS assumed — cloud-init.yml is only tested there (see infra/README.md)."
  type        = string
}
