// The specs assert the test fixture's wording, so they read the fixture whatever
// the workspace .env points the app at — assigned, never `??=`, or a demo
// deployment named there fails them with no hint why.
process.env['CONFIG_PATH'] = 'deployments/fixture/config';
