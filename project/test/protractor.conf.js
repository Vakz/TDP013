exports.config = {
  specs: [
    'frontend/*Test.js'
  ],

  capabilites: {
    browserName: 'chrome',
  },

  baseUrl: 'http://localhost:45555',

  framework: 'jasmine2',

  jasmineNodeOpts: {
    showColors: true
  }
};
