const nxPreset = require('@nx/jest/preset').default;

// sanitize-html pulls in an ESM-only parser tree. Node 24 handles require(esm)
// natively, but Jest's CJS runtime does not — so these few packages must be
// transpiled instead of being ignored along with the rest of node_modules.
// Projects that reach them also need `allowJs` in their spec tsconfig.
module.exports = {
  ...nxPreset,
  transformIgnorePatterns: [
    'node_modules/(?!(?:.*/)?(htmlparser2|domhandler|domutils|dom-serializer|domelementtype|entities)/)',
  ],
};
