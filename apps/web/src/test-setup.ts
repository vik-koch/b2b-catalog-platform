// The specs assert the fixture's wording, whatever the workspace .env names.
// Assigned, never `??=`, or a demo deployment there fails them silently.
process.env['CONFIG_PATH'] = 'deployments/fixture/config';
