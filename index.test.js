'use strict';

const mockBundle = { write: jest.fn() };
const mockRollup = jest.fn().mockResolvedValue(mockBundle);
const mockOnWatch = jest.fn();
const mockWatch = jest.fn().mockReturnValue({ on: mockOnWatch });
const mockDirExistsSync = jest.fn();
const mockRemoveSync = jest.fn();
const mockWatcher = { close: jest.fn() };
const mockGetAllFunctions = jest.fn().mockReturnValue(['test-function']);
const mockGetFunction = jest.fn().mockReturnValue({ handler: 'mock.handler' });
const mockUpdate = jest.fn();

jest.mock('rollup', () => ({
  rollup: mockRollup,
  watch: mockWatch
}));
const { rollup } = require('rollup');

jest.mock('fs-extra', () => ({
  removeSync: mockRemoveSync
}));
const Plugin = require('./index');

const mockServerless = {
  config: {
    servicePath: 'mock/service-path'
  },
  cli: {
    log: jest.fn()
  },
  service: {
    getAllFunctions: mockGetAllFunctions,
    getFunction: mockGetFunction,
    update: mockUpdate,
    package: {},
    provider: {
      environment: {
        NODE_ENV: 'test'
      }
    },
    custom: {
      rollup: {
        config: 'rollup.config.js',
        sourcemaps: false
      }
    }
  },
  utils: {
    dirExistsSync: mockDirExistsSync
  }
};
const mockOptions = {
  config: 'rollup.config.js',
  isOffline: false,
  environment: 'test',
  watch: false
};

beforeEach(() => {
  mockBundle.write.mockClear();
  mockRollup.mockClear();
  mockWatch.mockClear();
  mockDirExistsSync.mockClear();
  mockRemoveSync.mockClear();
  mockWatcher.close.mockClear();
  mockGetAllFunctions.mockClear();
  mockGetFunction.mockClear();
  mockUpdate.mockClear();
  mockOnWatch.mockClear();
});

test('should create a new plugin instance', () => {
  const plugin = new Plugin(mockServerless, mockOptions);

  expect(plugin).toHaveProperty('serverless', mockServerless);
  expect(plugin).toHaveProperty('options', mockOptions);
  expect(plugin).toHaveProperty('commands');
  expect(plugin).toHaveProperty('hooks');
});

test('should set the environment variables', () => {
  const plugin = new Plugin(mockServerless, mockOptions);
  plugin.setEnvironmentVariables();

  expect(process.env).toHaveProperty('IS_OFFLINE', 'false');
  expect(process.env).toHaveProperty('NODE_ENV', 'test');
  expect(process.env).toHaveProperty('SOURCE_MAPS', 'false');
});

test('should set the offline mode to true', () => {
  const plugin = new Plugin(mockServerless, mockOptions);
  plugin.setOfflineMode();

  expect(plugin.options).toHaveProperty('isOffline', true);
});

test('should return the config path', () => {
  const plugin = new Plugin(mockServerless, mockOptions);
  const path = plugin.getConfigPath();

  expect(path).toEqual('mock/service-path/rollup.config.js');
});

test('should return the config path from the options instead', () => {
  const plugin = new Plugin({ config: { servicePath: '' } }, { config: 'mock/rollup.config.js' });
  const path = plugin.getConfigPath();

  expect(path).toEqual('/mock/rollup.config.js');
});

test('should return the output dir folder path', () => {
  const plugin = new Plugin(mockServerless, mockOptions);

  plugin.config = {
    output: {
      dir: 'mock/output-dir'
    }
  };

  const path = plugin.getOutputFolder();
  expect(path).toEqual('mock/output-dir');
});

test('should return the output file path', () => {
  const plugin = new Plugin(mockServerless, mockOptions);

  plugin.config = {
    output: {
      file: 'mock/output/file'
    }
  };

  const path = plugin.getOutputFolder();
  expect(path).toEqual('mock');
});

test('should call the bundle.write rollup method', async () => {
  const plugin = new Plugin(mockServerless, mockOptions);
  plugin.options.isOffline = false;
  plugin.config = { output: 'mock-build' };

  await plugin.bundle();
  expect(mockRollup).toHaveBeenCalledWith({ output: 'mock-build' });
  expect(mockBundle.write).toHaveBeenCalledWith('mock-build');
});

test('should not bundle when offline mode is set', async () => {
  const plugin = new Plugin(mockServerless, mockOptions);
  plugin.options.isOffline = false;
  plugin.options.watch = false;

  expect(mockRollup).not.toHaveBeenCalled();
  expect(mockBundle.write).not.toHaveBeenCalled();
});

test('should throw an error when calling the rollup.rollup method', async () => {
  try {
    rollup.mockRejectedValue('mock error');

    const plugin = new Plugin(mockServerless, mockOptions);
    plugin.options.isOffline = false;
    plugin.config = { output: 'mock-build' };
    await plugin.bundle();
  } catch (error) {
    expect(error).toEqual('mock error');
  }
});

test('should remove the output folder', () => {
  const plugin = new Plugin(mockServerless, mockOptions);
  mockDirExistsSync.mockReturnValue(true);
  plugin.watcher = mockWatcher;
  plugin.config = {
    output: {
      dir: 'mock/'
    }
  };
  plugin.options.watch = true;
  plugin.clean();

  expect(mockDirExistsSync).toHaveBeenCalledWith('mock/');
  expect(mockRemoveSync).toHaveBeenCalledWith('mock/');
  expect(mockWatcher.close).toHaveBeenCalled();
});

test('should remove the output folder but not close the watcher if watcher is undefined', () => {
  const plugin = new Plugin(mockServerless, mockOptions);
  mockDirExistsSync.mockReturnValue(true);
  plugin.config = {
    output: {
      dir: 'mock/'
    }
  };
  plugin.options.watch = true;
  plugin.clean();

  expect(mockDirExistsSync).toHaveBeenCalledWith('mock/');
  expect(mockRemoveSync).toHaveBeenCalledWith('mock/');
  expect(mockWatcher.close).not.toHaveBeenCalled();
});

test('should remove the output folder and not close the watcher if watch mode is disabled', () => {
  const plugin = new Plugin(mockServerless, mockOptions);
  mockDirExistsSync.mockReturnValue(true);
  plugin.watcher = mockWatcher;
  plugin.config = {
    output: {
      dir: 'mock/'
    }
  };
  plugin.options.watch = false;
  plugin.clean();

  expect(mockDirExistsSync).toHaveBeenCalledWith('mock/');
  expect(mockRemoveSync).toHaveBeenCalledWith('mock/');
  expect(mockWatcher.close).not.toHaveBeenCalled();
});

test('should not remove the output folder and not close the watcher if watch mode is disabled', () => {
  const plugin = new Plugin(mockServerless, mockOptions);
  mockDirExistsSync.mockReturnValue(false);
  plugin.watcher = mockWatcher;
  plugin.config = {
    output: {
      dir: 'mock/'
    }
  };
  plugin.options.watch = false;
  plugin.clean();

  expect(mockDirExistsSync).toHaveBeenCalledWith('mock/');
  expect(mockRemoveSync).not.toHaveBeenCalled();
  expect(mockWatcher.close).not.toHaveBeenCalled();
});

test('should prepare the functions config and package setup', () => {
  const plugin = new Plugin(mockServerless, mockOptions);
  plugin.config = {
    output: {
      dir: 'mock'
    }
  };
  plugin.prepare();

  expect(mockGetAllFunctions).toHaveBeenCalled();
  expect(mockGetFunction).toHaveBeenCalled();
  expect(mockUpdate).toHaveBeenCalledWith({
    functions: {
      'test-function': {
        handler: 'mock/mock.handler'
      }
    },
    package: {
      exclude: ['**/*'],
      include: ['mock/**'],
      individually: false
    }
  });
});

test('should validate the rollup config', () => {
  const plugin = new Plugin({ ...mockServerless, config: { servicePath: '.' } }, mockOptions);

  expect(plugin.validate.bind(plugin)).not.toThrow();
});

test('should thrown an Invalid rollup config error when config is an array', () => {
  const plugin = new Plugin({ config: { servicePath: '.' } }, { config: 'array-rollup.config.js' });

  expect(plugin.validate.bind(plugin)).toThrow('Invalid rollup config');
});

test('should thrown an Rollup config is not valid error when config has invalid properties', () => {
  const plugin = new Plugin(
    { config: { servicePath: '.' } },
    { config: 'invalid-rollup.config.js' }
  );

  expect(plugin.validate.bind(plugin)).toThrow('input is a required field');
});

test('should start the rollup.watch mode', () => {
  const plugin = new Plugin(mockServerless, mockOptions);
  plugin.config = { watch: true };
  plugin.watch();

  expect(mockWatch).toHaveBeenCalledWith({ watch: true });
  expect(mockOnWatch).toHaveBeenCalled();
  expect(plugin.watcher).toHaveProperty('on');
  expect(plugin.options.watch).toBeTruthy();
});

test('should not start the rollup.watch mode if config.watch is undefined', () => {
  const plugin = new Plugin(mockServerless, mockOptions);
  plugin.config = {};
  plugin.watch();

  expect(mockWatch).not.toHaveBeenCalled();
  expect(mockOnWatch).not.toHaveBeenCalled();
  expect(plugin.watcher).toBeUndefined();
});
