<p align="center">
  <img src="https://www.flybondi.com/assets/images/logo.svg" title="Flybondi" width="300" style="margin-bottom: 1rem" />
</p>
<h1 align="center">@flybondi/serverless-rollup-plugin</h1>

[![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/semantic-release/semantic-release)
[![js-semistandard-style](https://img.shields.io/badge/code%20style-semistandard-brightgreen.svg?style=flat-square)](https://github.com/Flet/semistandard)
[![code style: prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=flat-square)](https://github.com/prettier/prettier)

A Serverless v1.x plugin to build your lambda functions with [Rollup](rollup). Optimize your packaged functions individually and much more!

## Overview
Rollup is a module bundler for JavaScript which compiles small pieces of code into something larger and more complex, such as a library or application. It uses the new standardized format for code modules included in the ES6 revision of JavaScript, instead of previous idiosyncratic solutions such as CommonJS and AMD. ES modules let you freely and seamlessly combine the most useful individual functions from your favorite libraries. This will eventually be possible natively everywhere, but Rollup lets you do it today.

## Install
```bash
  yarn add @flybondi/serverless-rollup-plugin --dev
```

Add the plugin to your `serverless.yml` file:

```yml
  custom:
    config: rollup.config.js
  plugins:
    - serverless-rollup-plugin
```

## Configure
The configuration of the plugin is done by defining a `custom: rollup` object in your serverless.yml with the path to your specific configuration file. For information on how to create the config file could be found [here](https://rollupjs.org/guide/en#configuration-files).

## Usage
### Automatic bundling
The normal Serverless deploy procedure will automatically bundle with rollup:
  * Create the Serverless project with serverless create -t aws-nodejs
  * Install Serverless Rollup as above
  * Deploy with serverless deploy

[flybondi]: https://www.flybondi.com
[rollup]: https://rollupjs.org
