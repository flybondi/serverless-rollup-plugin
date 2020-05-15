'use strict';
const { rollup, watch } = require('rollup');
const { F, ifElse, is, path, pathOr, propEq } = require('ramda');
const { arrayOutputSchema, inputSchema, outputSchema } = require('./src/schemas');
const fse = require('fs-extra');
const Promise = require('bluebird');

/**
 * Check if given value is an instance of array
 * @func
 * @param {*} value to check
 * @returns boolean
 */
const isArray = is(Array);
/**
 * Check if the `verbose` options equals true.
 * @func
 * @param {object} value to check the property verbose
 * @returns boolean
 */
const isVerbose = propEq('verbose', true);
/**
 * This method will a function that will we use to validate the config schema.
 * @func
 * @param {array|object} value to check if is an array
 * @returns function to validate schema
 */
const validateOutput = ifElse(isArray, arrayOutputSchema.validateSync, outputSchema.validateSync);
/**
 * Method to return a logger function that will only be used in case that the verbose options is true
 * @param {Serverless} serverless instance of serverless
 * @param {Serverless.options} options serverless option object
 * @returns function to log on console
 */
const createLogger = (serverless, options) =>
  ifElse(
    isVerbose,
    () => path(['cli', 'log'], serverless),
    () => F
  )(options);

/**
 *
 *
 * @class ServerlessRollupPlugin
 */
class ServerlessRollupPlugin {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.commands = {
      rollup: {
        usage: 'Bundle your lambda function with rollup',
        lifecycleEvents: ['compile'],
        options: {
          config: {
            usage:
              'Specify the rollup config you want to use' +
              '(e.g. "--config \'rollup.config.js\'" or "-c \'rollup.config.js\'")',
            required: true,
            shortcut: 'c'
          }
        },
        commands: {
          compile: {
            type: 'entrypoint',
            lifecycleEvents: ['bundle']
          },
          prepare: {
            type: 'entrypoint',
            lifecycleEvents: ['validate', 'serverless']
          },
          clean: {
            type: 'entrypoint',
            lifecycleEvents: ['delete']
          }
        }
      }
    };

    this.hooks = {
      // Serverless deploy
      'before:package:createDeploymentArtifacts': () =>
        Promise.bind(this)
          .then(() => this.serverless.pluginManager.spawn('rollup:prepare'))
          .then(() => this.serverless.pluginManager.spawn('rollup:compile')),
      'after:package:createDeploymentArtifacts': () =>
        Promise.bind(this).then(() => this.serverless.pluginManager.spawn('rollup:clean')),

      // Serverless deploy function
      'before:package:function:package': () =>
        Promise.bind(this)
          .then(() => this.serverless.pluginManager.spawn('rollup:prepare'))
          .then(() => this.serverless.pluginManager.spawn('rollup:compile')),
      'after:package:function:package': () =>
        Promise.bind(this).then(() => this.serverless.pluginManager.spawn('rollup:clean')),

      // Serverless offline support
      'before:offline:start': () =>
        Promise.bind(this)
          .then(() => this.setOfflineMode())
          .then(() => this.serverless.pluginManager.spawn('rollup:prepare'))
          .then(() => this.serverless.pluginManager.spawn('rollup:compile'))
          .then(() => this.watch()),

      'before:offline:start:init': () =>
        Promise.bind(this)
          .then(() => this.setOfflineMode())
          .then(() => this.serverless.pluginManager.spawn('rollup:prepare'))
          .then(() => this.serverless.pluginManager.spawn('rollup:compile'))
          .then(() => this.watch()),

      'before:offline:start:end': () =>
        Promise.bind(this).then(() => this.serverless.pluginManager.spawn('rollup:clean')),

      // Serverless rollup
      'before:rollup:compile': this.validate.bind(this),
      'rollup:compile': this.bundle.bind(this),
      'rollup:clean': this.clean.bind(this),

      // Internal events
      'before:rollup:prepare:validate': this.setEnvironmentVariables.bind(this),
      'rollup:prepare:validate': this.validate.bind(this),
      'rollup:prepare:serverless': this.prepare.bind(this),
      'rollup:compile:bundle': this.bundle.bind(this),
      'rollup:clean:delete': this.clean.bind(this)
    };

    this.log = createLogger(this.serverless, this.options).bind(this.serverless.cli);
  }

  setEnvironmentVariables() {
    // @FIXME(lf):
    // Maybe use dotenv, but this will work for now.
    this.log('Rollup: Setting environment variables');

    process.env.IS_OFFLINE = this.options.isOffline || false;
    process.env.NODE_ENV = pathOr(
      this.options.environment || 'development',
      ['service', 'provider', 'environment', 'NODE_ENV'],
      this.serverless
    );
    process.env.SOURCE_MAPS = pathOr(
      this.options.sourcemaps || false,
      ['service', 'custom', 'rollup', 'config', 'sourcemaps'],
      this.serverless
    );
  }

  setOfflineMode() {
    this.options.isOffline = true;
  }

  getConfigPath() {
    return `${this.serverless.config.servicePath}/${pathOr(
      this.options.config,
      ['service', 'custom', 'rollup', 'config'],
      this.serverless
    )}`;
  }

  getOutputFolder() {
    const { output } = this.config;
    // FIXME(lf): this will only work on unix envs.
    return output.dir || output.file.split('/')[0];
  }

  async bundle() {
    this.log('Rollup: Config file is valid, about to bundle lambda function');
    if (!this.options.isOffline && !this.options.watch) {
      try {
        const bundle = await rollup(this.config);
        await bundle.write(this.config.output);

        this.log('Rollup: Bundle created successfully!');
      } catch (error) {
        this.log('Rollup: There was an error while bundling the service with rollup.');
        throw error;
      }
    }
  }

  clean() {
    const folderPath = this.getOutputFolder();
    this.log(`Rollup: Removing temporary folder ${folderPath}`);

    if (this.serverless.utils.dirExistsSync(folderPath)) {
      fse.removeSync(folderPath);
    }

    if (this.options.watch) {
      this.watcher && this.watcher.close();
    }
  }

  prepare() {
    // Grab all functions data and mapped their package setting use the rollup output if in the serverless config is set to package individually,
    // otherwise, set the global package setting.
    const functionNames = this.serverless.service.getAllFunctions();
    const functions = {};
    const output = this.getOutputFolder();

    // Rollup will bundle all in a single file, so individual package should be override to false and include only the output folder;
    const originalPackage = this.serverless.service.package;
    const include = originalPackage.include || [];
    // Add Rollup output folder so serverles include it in the package.
    this.log('Rollup: Setting package options');
    include.push(`${this.getOutputFolder()}/**`);

    // Modify functions handler to use the rollup output folder
    this.log('Rollup: Prepare functions handler location');
    functionNames.forEach(name => {
      const func = this.serverless.service.getFunction(name);
      const handler = `${output}/${func.handler}`;
      this.log(`Rollup: Preparing ${name} function, setting handler to ${handler}`);
      functions[name] = { ...func, handler };
    });

    this.log(`Rollup: Overriding service options`);
    this.serverless.service.update({
      package: {
        ...originalPackage,
        individually: false,
        exclude: ['**/*'],
        include
      },
      functions
    });
  }

  validate() {
    const path = this.getConfigPath();
    this.log(`Rollup: Starting rollup plugin with config located at ${path}`);
    const config = require(path);

    if (isArray(config)) {
      this.log(
        'Rollup: This plugin does not support multiple inputs, please check the rollup config file'
      );
      throw new Error('Invalid rollup config');
    }

    if (inputSchema.validateSync(config) && validateOutput(config.output)) {
      this.config = config;
    } else {
      this.log('Rollup: Given config file is not valid, please check the rollup config file');
      throw new Error('Rollup config is not valid');
    }
  }

  watch() {
    const watchOptions = this.config.watch || false;

    if (watchOptions) {
      this.log('Rollup: Watch mode is enable', this.config.watch);
      const watcher = watch(this.config);
      watcher.on('event', event => {
        const { code, duration } = event;
        switch (code) {
          case 'START':
            this.log(
              `Rollup: [${new Date().toISOString()}] - Watcher started and waiting for changes`
            );
            break;
          case 'BUNDLE_END':
            this.log(
              `Rollup: [${new Date().toISOString()}] - Bundle has been rebuilt in ${duration}`
            );
            break;
          case 'ERROR':
            this.log(
              `Rollup: [${new Date().toISOString()}] - There is an error with the bundle, please check what are you trying to build.`
            );
            break;
          default:
            break;
        }
      });

      this.watcher = watcher;
      this.options.watch = true;
    }
  }
}

module.exports = ServerlessRollupPlugin;
