# Non-secret deployment parameters, auto-loaded by terraform.
# demo_id is deliberately NOT set here — it is per-run (TF_VAR_demo_id in CI).

domain             = "vikkoch.com"
cloudflare_zone_id = "a15ff2a519535f6ce565c63444eef9ab"
server_type        = "cx23"
location           = "nbg1"
image              = "ubuntu-24.04"
