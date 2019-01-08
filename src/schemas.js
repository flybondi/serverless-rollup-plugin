'use strict';
const { array, mixed, object, string, boolean, number } = require('yup');

const outputSchema = object()
  .shape({
    // required (can be an array, for multiple outputs)
    // core output options
    format: string()
      .oneOf(
        ['amd', 'cjs', 'esm', 'iife', 'umd', 'system'],
        'Supported options for format are: amd, cjs, esm, iife, umd, system'
      )
      .required('output.format is required'), // required
    file: string().notRequired(),
    dir: string().notRequired(),
    name: string().notRequired(),
    globals: object().notRequired(),
    // advanced output options
    paths: mixed().notRequired(),
    banner: string().notRequired(),
    footer: string().notRequired(),
    intro: string().notRequired(),
    outro: string().notRequired(),
    sourcemap: boolean().notRequired(),
    sourcemapFile: string().notRequired(),
    sourcemapPathTransform: mixed().notRequired(),
    interop: boolean().notRequired(),
    extend: boolean().notRequired(),
    // danger zone
    exports: string()
      .oneOf(
        ['default', 'named', 'none', 'auto'],
        'Supported option for exports are: default, named, none, auto'
      )
      .notRequired(),
    amd: object()
      .shape({
        id: string(),
        define: string()
      })
      .notRequired(),
    indent: mixed().notRequired(),
    strict: boolean().notRequired(),
    freeze: boolean().notRequired(),
    namespaceToStringTag: boolean().notRequired(),
    // experimental
    entryFileNames: string().notRequired(),
    chunkFileNames: string().notRequired(),
    assetFileNames: string().notRequired()
  })
  .required('output is required');
const arrayOutputSchema = array().of(outputSchema);
const inputSchema = object().shape({
  input: mixed().required('input is a required field'), // required
  external: mixed().notRequired(),
  plugins: array().notRequired(),
  // advanced input options
  onwarn: mixed().notRequired(),
  perf: boolean().notRequired(),
  // danger zone
  acorn: object().notRequired(),
  acornInjectPlugins: mixed().notRequired(),
  treeshake: mixed().notRequired(),
  context: string().notRequired(),
  moduleContext: mixed().notRequired(),
  // experimental
  experimentalCodeSplitting: boolean().notRequired(),
  manualChunks: object().notRequired(),
  experimentalOptimizeChunks: boolean().notRequired(),
  chunkGroupingSize: number().notRequired()
});

module.exports = {
  inputSchema,
  outputSchema,
  arrayOutputSchema
};
