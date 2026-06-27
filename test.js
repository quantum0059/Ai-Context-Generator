const { generateManifests } = require('./src/contextforge/generators/manifests');
const spec = { features: ['foo'], stack: {}, platform: 'web' };
generateManifests(spec, {}).then(res => console.log(res['context-manifests/foo-guide.md']));
