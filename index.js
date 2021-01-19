'use strict';
const { rollup, watch } = require('rollup');
const fse = require('fs-extra');
const glob = require('fast-glob');
const normalize = require('normalize-path');
const { dirname, extname, join, sep } = require('path');
const { arrayOutputSchema, inputSchema, outputSchema } = require('./src/schemas');

/**
 * @constant {string[]}
 */
const SUPPORTED_EXTENSIONS = Object.freeze(['js', 'ts', 'jsx', 'tsx']);

/**
 * This method will a function that will we use to validate the config schema.
 *
 * @param {Array|object} value to check if is an array
 * @returns function to validate schema
 */
const validateOutput = value => {
  return Array.isArray(value)
    ? arrayOutputSchema.validateSync(value)
    : outputSchema.validateSync(value);
};

/**
 * Method to return a logger function that will only be used in case the `verbose` options is `true`.
 *
 * @param {import('serverless')} serverless instance of serverless
 * @param {import('serverless').Options} options serverless option object
 * @returns {function} A logging function.
 */
const createLogger = (serverless, options) => {
  return options.verbose ? serverless.cli.log : () => false;
};

/**
 * Remove any `null`, `undefined` or `''` elements from `values`.
 *
 * @param {string[]} values The elements to filter.
 * @returns {string[]} The filtered array of string elements.
 */
const rejectNilOrEmpty = values =>
  values.filter(value => value !== undefined && value !== null && value.length > 0);

/**
 * Returns the result of concatenating the given string values, removing
 * any duplicates as well as `null`, `undefined` or empty values.
 *
 * @param {string|string[]} first The first element (or list of elements) to combine.
 * @param {string|string[]} [second] The second element (or list of elements) to combine.
 * @returns {string[]} The combined list of element.
 */
const concatUniq = (first, second) => {
  const items = rejectNilOrEmpty([].concat(first, second));
  return Array.from(new Set(items));
};

/**
 * Extracts the root of a given `path` (i.e.: the first component or directory in it).
 *
 * @example
 * rootOfPath('foo/bar/baz.js'); // -> 'foo'
 *
 * @param {string} path The path to extract the root from.
 * @returns {string} The root of the path.
 */
const rootOfPath = path => {
  return path.split(sep).shift();
};

/**
 * Join all arguments together and normalize the resulting path'
 * to be posix/unix-like forward slashes.
 *
 * @see https://github.com/mrmlnc/fast-glob#how-to-write-patterns-on-windows
 * @param {...string[]} paths The list of paths to join.
 * @returns {string} The joined, normalized path.
 */
const globPath = (...paths) => {
  return normalize(join(...paths));
};

/**
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
    this.handlerConfigs = [];

    this.hooks = {
      // Serverless deploy
      'before:package:createDeploymentArtifacts': async () => {
        await this.serverless.pluginManager.spawn('rollup:prepare');
        return this.serverless.pluginManager.spawn('rollup:compile');
      },

      'after:package:createDeploymentArtifacts': () => {
        return this.serverless.pluginManager.spawn('rollup:clean');
      },

      // Serverless deploy function
      'before:package:function:package': async () => {
        await this.serverless.pluginManager.spawn('rollup:prepare');
        return this.serverless.pluginManager.spawn('rollup:compile');
      },

      'after:package:function:package': () => {
        return this.serverless.pluginManager.spawn('rollup:clean');
      },

      // Serverless offline support
      'before:offline:start': async () => {
        this.setOfflineMode();
        await this.serverless.pluginManager.spawn('rollup:prepare');
        await this.serverless.pluginManager.spawn('rollup:compile');
        return this.watch();
      },

      'before:offline:start:init': async () => {
        this.setOfflineMode();
        await this.serverless.pluginManager.spawn('rollup:prepare');
        await this.serverless.pluginManager.spawn('rollup:compile');
        return this.watch();
      },

      'before:offline:start:end': () => {
        return this.serverless.pluginManager.spawn('rollup:clean');
      },

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
    process.env.NODE_ENV =
      this.serverless?.service?.provider?.environment.NODE_ENV ??
      this.options.environment ??
      'development';
    process.env.SOURCE_MAPS =
      this.options.sourcemaps ??
      this.serverless?.service?.custom?.rollup?.config?.sourcemaps ??
      false;
  }

  setOfflineMode() {
    this.options.isOffline = true;
  }

  getConfigPath() {
    const configFilename = this.serverless?.service?.custom?.rollup?.config ?? this.options.config;
    // The value returned by this function is actually used to `require` the file,
    // the use of `/` as separator is safe
    return rejectNilOrEmpty([this.serverless.config.servicePath, configFilename]).join('/');
  }

  getOutputDir() {
    const output = this.config.output;
    return output.dir ?? rootOfPath(output.file);
  }

  onWatchEventHandler(event) {
    const { code, duration, error } = event;
    switch (code) {
      case 'START':
        this.log(
          `Rollup: [${new Date().toISOString()}] - Watcher started and waiting for changes.`
        );
        break;
      case 'BUNDLE_END':
        this.log(`Rollup: [${new Date().toISOString()}] - Bundle has been rebuilt in ${duration}.`);
        break;
      case 'ERROR':
        this.log(
          `Rollup: [${new Date().toISOString()}] - There is an error with the bundle, please check what are you trying to build. [${error}]`
        );
        break;
      default:
        break;
    }
  }

  getEntryExtension(entry) {
    const [supportedFile] = glob.sync(`${entry}.{${SUPPORTED_EXTENSIONS}}`, {
      cwd: this.serverless.config.servicePath,
      unique: true
    });

    this.log(
      `Rollup: ${JSON.stringify({
        entry,
        supportedFile,
        glob: `${entry}.{${SUPPORTED_EXTENSIONS}}`
      })}`
    );

    return supportedFile
      ? { ext: extname(supportedFile), dir: dirname(supportedFile) }
      : { ext: null, dir: null };
  }

  prepareIndividualHandler(func, outputDir) {
    // Need to retrieve the entry file extension
    const [, entry] = func.handler.match(/^(.*)\.([^.]+)$/);
    const { ext, dir } = this.getEntryExtension(entry);

    // creating a handler specific input rollup config
    const config = {
      ...this.config,
      input: `${entry}${ext}`,
      output: {
        ...this.config.output,
        dir: join(outputDir, dir)
      }
    };

    this.log(
      `Rollup: Generated rollup configuration for handler ${func.handler} ${JSON.stringify(config)}`
    );

    this.handlerConfigs.push(config);

    return {
      // adding the package option to the handler serverless config.
      ...func,
      handler: join(outputDir, func.handler),
      package: {
        ...func.package,
        include: concatUniq(globPath(outputDir, dir, '**/*'), func.package?.include),
        exclude: concatUniq('**/*', func.package?.exclude)
      }
    };
  }

  async bundle() {
    const writeBundle = async config => {
      this.log(`Rollup: Creating bundle for ${config.input}`);
      const bundle = await rollup(config);
      return bundle.write(config.output);
    };

    this.log('Rollup: Config file is valid, about to bundle lambda function');
    if (!this.options.isOffline && !this.options.watch) {
      try {
        const { individually } = this.serverless.service.package;
        individually
          ? await Promise.all(this.handlerConfigs.map(writeBundle))
          : await writeBundle(this.config);

        this.log('Rollup: Bundle created successfully!');
      } catch (error) {
        this.log('Rollup: There was an error while bundling the service with rollup.');
        throw error;
      }
    }
  }

  clean() {
    const folderPath = this.getOutputDir();
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
    const output = this.getOutputDir();

    const originalPackage = this.serverless.service.package;
    const include = originalPackage.include || [];
    const individually = originalPackage.individually || false;
    // Add Rollup output folder so serverless include it in the package.
    this.log('Rollup: Setting package options');
    !individually && include.push(globPath(this.getOutputDir(), '**'));

    // Modify functions handler to use the rollup output folder
    this.log('Rollup: Prepare functions handler location');
    functionNames.forEach(name => {
      const func = this.serverless.service.getFunction(name);
      const handler = join(output, func.handler);
      this.log(`Rollup: Preparing ${name} function, setting handler to ${handler}`);

      functions[name] = individually
        ? this.prepareIndividualHandler(func, output)
        : { ...func, handler };
    });

    this.log(`Rollup: Overriding service options`);

    this.serverless.service.update({
      functions,
      package: {
        ...originalPackage,
        exclude: ['**/*'],
        include
      }
    });
  }

  validate() {
    const path = this.getConfigPath();
    this.log(`Rollup: Starting rollup plugin with config located at ${path}`);
    const config = require(path);

    if (Array.isArray(config)) {
      this.log(
        'Rollup: This plugin does not support multiple inputs, please check the rollup config file'
      );
      throw new Error('Invalid rollup config');
    }

    try {
      if (inputSchema.validateSync(config) && validateOutput(config.output)) {
        this.config = config;
      }
    } catch (error) {
      this.log(
        `Rollup: Given config file is not valid, please check the rollup config file: ${error.message}`
      );
      throw new Error(`Rollup config is not valid: ${error.message}`);
    }
  }

  watch() {
    const shouldWatch = this.config.watch || false;

    if (shouldWatch) {
      const config = this.serverless.service.package.individually
        ? this.handlerConfigs
        : this.config;
      this.log('Rollup: Watch mode is enable');
      const watcher = watch(config);
      watcher.on('event', this.onWatchEventHandler.bind(this));

      this.watcher = watcher;
      this.options.watch = true;
    }
  }
}

module.exports = ServerlessRollupPlugin;
