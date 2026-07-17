output "demo_url" {
  description = "Public URL of the demo stack once deployed."
  value       = "https://${local.fqdn}"
}

output "demo_fqdn" {
  value = local.fqdn
}

output "ipv4_address" {
  description = "Server address the CD workflow SSHes into (as user deploy)."
  value       = hcloud_server.demo.ipv4_address
}
