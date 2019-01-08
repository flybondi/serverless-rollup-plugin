'use strict';
const Plugin = require('./index');

const mockServerless = {
  cli: {
    log: jest.fn()
  }
};
const mockOptions = {
  config: 'rollup.config.test.js'
};

test('should create a new plugin instance', () => {
  const plugin = new Plugin(mockServerless, mockOptions);

  expect(plugin).toHaveProperty('serverless', mockServerless);
  expect(plugin).toHaveProperty('options', mockOptions);
  expect(plugin).toHaveProperty('commands');
  expect(plugin).toHaveProperty('hooks');
});

test('should set input and output options', () => {
  const plugin = new Plugin(mockServerless, mockOptions);

  plugin.beforeRollupStart();
  expect(plugin).toHaveProperty('inputOptions');
  expect(plugin).toHaveProperty('outputOptions');
});
