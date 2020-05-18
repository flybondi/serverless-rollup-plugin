'use strict';

const MockDate = require('mockdate');
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
const mockLog = jest.fn();
const mockSpawn = jest.fn();

jest.mock('rollup', () => ({
  rollup: mockRollup,
  watch: mockWatch
}));
const { rollup } = require('rollup');

jest.mock('fs-extra', () => ({
  removeSync: mockRemoveSync
}));
const Plugin = require('./index');

beforeEach(() => {
  mockBundle.write.mockClear();
  mockDirExistsSync.mockClear();
  mockGetAllFunctions.mockClear();
  mockGetFunction.mockClear();
  mockLog.mockClear();
  mockOnWatch.mockClear();
  mockRemoveSync.mockClear();
  mockRollup.mockClear();
  mockUpdate.mockClear();
  mockWatch.mockClear();
  mockWatcher.close.mockClear();
  mockSpawn.mockClear();

  MockDate.set('2020-05-15');
});

afterEach(() => {
  MockDate.reset();
});

describe('The serverless hooks', () => {
  const mockServerless = {
    config: {
      servicePath: 'mock/service-path'
    },
    cli: {
      log: mockLog
    },
    pluginManager: {
      spawn: mockSpawn
    }
  };
  const mockOptions = {
    config: 'rollup.config.js',
    isOffline: false,
    environment: 'test',
    watch: false
  };

  it('should create all the hooks', () => {
    const plugin = new Plugin(mockServerless, mockOptions);

    expect(plugin).toHaveProperty('hooks');
    expect(plugin.hooks['before:package:createDeploymentArtifacts']).toBeInstanceOf(Function);
    expect(plugin.hooks['after:package:createDeploymentArtifacts']).toBeInstanceOf(Function);
    expect(plugin.hooks['before:package:function:package']).toBeInstanceOf(Function);
    expect(plugin.hooks['after:package:function:package']).toBeInstanceOf(Function);
    expect(plugin.hooks['before:offline:start']).toBeInstanceOf(Function);
    expect(plugin.hooks['before:offline:start:init']).toBeInstanceOf(Function);
    expect(plugin.hooks['before:offline:start:end']).toBeInstanceOf(Function);
    expect(plugin.hooks['before:rollup:compile']).toBeInstanceOf(Function);
    expect(plugin.hooks['rollup:compile']).toBeInstanceOf(Function);
    expect(plugin.hooks['rollup:clean']).toBeInstanceOf(Function);
    expect(plugin.hooks['before:rollup:prepare:validate']).toBeInstanceOf(Function);
    expect(plugin.hooks['rollup:prepare:validate']).toBeInstanceOf(Function);
    expect(plugin.hooks['rollup:prepare:serverless']).toBeInstanceOf(Function);
    expect(plugin.hooks['rollup:compile:bundle']).toBeInstanceOf(Function);
    expect(plugin.hooks['rollup:clean:delete']).toBeInstanceOf(Function);
  });

  it('should spawn the rollup:prepare & rollup:compile', async () => {
    const plugin = new Plugin(mockServerless, mockOptions);
    await plugin.hooks['before:package:createDeploymentArtifacts']();

    expect(mockSpawn).toHaveBeenNthCalledWith(1, 'rollup:prepare');
    expect(mockSpawn).toHaveBeenNthCalledWith(2, 'rollup:compile');
  });

  it('should spawn the rollup:clean', async () => {
    const plugin = new Plugin(mockServerless, mockOptions);
    await plugin.hooks['after:package:createDeploymentArtifacts']();

    expect(mockSpawn).toHaveBeenNthCalledWith(1, 'rollup:clean');
  });

  it('should spawn the rollup:prepare & rollup:compile on a serverless deploy', async () => {
    const plugin = new Plugin(mockServerless, mockOptions);
    await plugin.hooks['before:package:function:package']();

    expect(mockSpawn).toHaveBeenNthCalledWith(1, 'rollup:prepare');
    expect(mockSpawn).toHaveBeenNthCalledWith(2, 'rollup:compile');
  });

  it('should spawn the rollup:clean on a serverless deploy', async () => {
    const plugin = new Plugin(mockServerless, mockOptions);
    await plugin.hooks['after:package:function:package']();

    expect(mockSpawn).toHaveBeenNthCalledWith(1, 'rollup:clean');
  });

  it('should set the offline mode and spawn the rollup:prepare & rollup:compile', async () => {
    const mockWatch = jest.fn();
    const plugin = new Plugin(mockServerless, mockOptions);
    plugin.watch = mockWatch;
    await plugin.hooks['before:offline:start']();

    expect(plugin.options).toHaveProperty('isOffline', true);
    expect(mockSpawn).toHaveBeenNthCalledWith(1, 'rollup:prepare');
    expect(mockSpawn).toHaveBeenNthCalledWith(2, 'rollup:compile');
    expect(mockWatch).toHaveBeenCalled();
  });

  it('should set the offline mode and spawn the rollup:prepare & rollup:compile on offline init', async () => {
    const mockWatch = jest.fn();
    const plugin = new Plugin(mockServerless, mockOptions);
    plugin.watch = mockWatch;
    await plugin.hooks['before:offline:start:init']();

    expect(plugin.options).toHaveProperty('isOffline', true);
    expect(mockSpawn).toHaveBeenNthCalledWith(1, 'rollup:prepare');
    expect(mockSpawn).toHaveBeenNthCalledWith(2, 'rollup:compile');
    expect(mockWatch).toHaveBeenCalled();
  });

  it('should spawn the rollup:clean on a serverless offline end', async () => {
    const plugin = new Plugin(mockServerless, mockOptions);
    await plugin.hooks['before:offline:start:end']();

    expect(mockSpawn).toHaveBeenNthCalledWith(1, 'rollup:clean');
  });
});

describe('The plugin class methods ', () => {
  const mockServerless = {
    config: {
      servicePath: 'mock/service-path'
    },
    cli: {
      log: mockLog
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

  it('should create a new plugin instance', () => {
    const plugin = new Plugin(mockServerless, mockOptions);

    expect(plugin).toHaveProperty('serverless', mockServerless);
    expect(plugin).toHaveProperty('options', mockOptions);
    expect(plugin).toHaveProperty('commands');
    expect(plugin).toHaveProperty('hooks');
  });

  it('should set the environment variables', () => {
    const plugin = new Plugin(mockServerless, mockOptions);
    plugin.setEnvironmentVariables();

    expect(process.env).toHaveProperty('IS_OFFLINE', 'false');
    expect(process.env).toHaveProperty('NODE_ENV', 'test');
    expect(process.env).toHaveProperty('SOURCE_MAPS', 'false');
  });

  it('should set the environment variables from the options obj', () => {
    const plugin = new Plugin({}, { environment: 'test', sourcemaps: true, isOffline: true });
    plugin.setEnvironmentVariables();

    expect(process.env).toHaveProperty('IS_OFFLINE', 'true');
    expect(process.env).toHaveProperty('NODE_ENV', 'test');
    expect(process.env).toHaveProperty('SOURCE_MAPS', 'true');
  });

  it('should set the environment variables with the default values', () => {
    const plugin = new Plugin({}, {});
    plugin.setEnvironmentVariables();

    expect(process.env).toHaveProperty('IS_OFFLINE', 'false');
    expect(process.env).toHaveProperty('NODE_ENV', 'development');
    expect(process.env).toHaveProperty('SOURCE_MAPS', 'false');
  });

  it('should set the offline mode to true', () => {
    const plugin = new Plugin(mockServerless, mockOptions);
    plugin.setOfflineMode();

    expect(plugin.options).toHaveProperty('isOffline', true);
  });

  it('should return the config path', () => {
    const plugin = new Plugin(mockServerless, mockOptions);
    const path = plugin.getConfigPath();

    expect(path).toEqual('mock/service-path/rollup.config.js');
  });

  it('should return the config path from the options instead', () => {
    const plugin = new Plugin({ config: { servicePath: '' } }, { config: 'mock/rollup.config.js' });
    const path = plugin.getConfigPath();

    expect(path).toEqual('/mock/rollup.config.js');
  });

  it('should return the output dir folder path', () => {
    const plugin = new Plugin(mockServerless, mockOptions);

    plugin.config = {
      output: {
        dir: 'mock/output-dir'
      }
    };

    const path = plugin.getOutputFolder();
    expect(path).toEqual('mock/output-dir');
  });

  it('should return the output file path', () => {
    const plugin = new Plugin(mockServerless, mockOptions);

    plugin.config = {
      output: {
        file: 'mock/output/file'
      }
    };

    const path = plugin.getOutputFolder();
    expect(path).toEqual('mock');
  });

  it('should call the bundle.write rollup method', async () => {
    const plugin = new Plugin(mockServerless, mockOptions);
    plugin.options.isOffline = false;
    plugin.config = { output: 'mock-build' };

    await plugin.bundle();
    expect(mockRollup).toHaveBeenCalledWith({ output: 'mock-build' });
    expect(mockBundle.write).toHaveBeenCalledWith('mock-build');
  });

  it('should not bundle when offline mode is set', async () => {
    const plugin = new Plugin(mockServerless, mockOptions);
    plugin.options.isOffline = false;
    plugin.options.watch = true;

    expect(mockRollup).not.toHaveBeenCalled();
    expect(mockBundle.write).not.toHaveBeenCalled();
  });

  it('should not bundle when offline mode and watch options are set', async () => {
    const plugin = new Plugin(mockServerless, mockOptions);
    plugin.options.isOffline = false;
    plugin.options.watch = false;

    expect(mockRollup).not.toHaveBeenCalled();
    expect(mockBundle.write).not.toHaveBeenCalled();
  });

  it('should not bundle when offline mode is on and watch is off ', async () => {
    const plugin = new Plugin(mockServerless, mockOptions);
    plugin.options.isOffline = true;
    plugin.options.watch = false;

    expect(mockRollup).not.toHaveBeenCalled();
    expect(mockBundle.write).not.toHaveBeenCalled();
  });

  it('should throw an error when calling the rollup.rollup method', async () => {
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

  it('should remove the output folder', () => {
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

  it('should remove the output folder but not close the watcher if watcher is undefined', () => {
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

  it('should remove the output folder and not close the watcher if watch mode is disabled', () => {
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

  it('should not remove the output folder and not close the watcher if watch mode is disabled', () => {
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

  it('should prepare the functions config and package setup', () => {
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

  it('should validate the rollup config', () => {
    const plugin = new Plugin({ ...mockServerless, config: { servicePath: '.' } }, mockOptions);

    expect(plugin.validate.bind(plugin)).not.toThrow();
  });

  it('should thrown an Invalid rollup config error when config is an array', () => {
    const plugin = new Plugin(
      { config: { servicePath: '.' } },
      { config: 'array-rollup.config.js' }
    );

    expect(plugin.validate.bind(plugin)).toThrow('Invalid rollup config');
  });

  it('should thrown an Rollup config is not valid error when config has invalid properties', () => {
    const plugin = new Plugin(
      { config: { servicePath: '.' } },
      { config: 'invalid-rollup.config.js' }
    );

    expect(plugin.validate.bind(plugin)).toThrow('input is a required field');
  });

  it('should start the rollup.watch mode', () => {
    const plugin = new Plugin(mockServerless, mockOptions);
    plugin.config = { watch: true };
    plugin.watch();

    expect(mockWatch).toHaveBeenCalledWith({ watch: true });
    expect(mockOnWatch).toHaveBeenCalled();
    expect(plugin.watcher).toHaveProperty('on');
    expect(plugin.options.watch).toBeTruthy();
  });

  it('should not start the rollup.watch mode if config.watch is undefined', () => {
    const plugin = new Plugin(mockServerless, mockOptions);
    plugin.config = {};
    plugin.watch();

    expect(mockWatch).not.toHaveBeenCalled();
    expect(mockOnWatch).not.toHaveBeenCalled();
    expect(plugin.watcher).toBeUndefined();
  });

  it('should log that the watcher has started', () => {
    const mockEvent = {
      code: 'START'
    };
    const plugin = new Plugin(mockServerless, { ...mockOptions, verbose: true });
    plugin.onWatchEventHandler(mockEvent);

    expect(mockLog).toHaveBeenCalledWith(
      'Rollup: [2020-05-15T00:00:00.000Z] - Watcher started and waiting for changes.'
    );
  });

  it('should log that the watcher has been bundled', () => {
    const mockEvent = {
      code: 'BUNDLE_END',
      duration: 500
    };
    const plugin = new Plugin(mockServerless, { ...mockOptions, verbose: true });
    plugin.onWatchEventHandler(mockEvent);

    expect(mockLog).toHaveBeenCalledWith(
      'Rollup: [2020-05-15T00:00:00.000Z] - Bundle has been rebuilt in 500.'
    );
  });

  it('should log that the watcher has an error', () => {
    const mockEvent = {
      code: 'ERROR',
      duration: 500
    };
    const plugin = new Plugin(mockServerless, { ...mockOptions, verbose: true });
    plugin.onWatchEventHandler(mockEvent);

    expect(mockLog).toHaveBeenCalledWith(
      'Rollup: [2020-05-15T00:00:00.000Z] - There is an error with the bundle, please check what are you trying to build.'
    );
  });

  it('should do nothing if the code if not expect', () => {
    const mockEvent = {
      code: 'FOO'
    };
    const plugin = new Plugin(mockServerless, { ...mockOptions, verbose: true });
    plugin.onWatchEventHandler(mockEvent);

    expect(mockLog).not.toHaveBeenCalled();
  });
});
