import typescript from '@rollup/plugin-typescript';
import babel from "@rollup/plugin-babel";
import commonjs from "@rollup/plugin-commonjs";
import pkg from '../package.json'
import nodeResolve from "@rollup/plugin-node-resolve";
import {uglify} from "rollup-plugin-uglify";
import json from "@rollup/plugin-json";
import nodePolyfills from 'rollup-plugin-node-polyfills';
import serve from 'rollup-plugin-serve'

export default {
  input: "./src/index.ts",
  output: [
    {
      file: pkg.main,
      format: 'cjs',
    },
    {
      file: pkg.module,
      format: 'esm',
    },
    {
      file: pkg.browser,
      format: 'umd',
      name: 'cti',
      sourcemap:true
    },
  ],
  plugins: [
    typescript(),
    babel({
      babelHelpers: 'bundled',
      plugins: ['external-helpers'],
      exclude: /node_modules/,
      presets: [
        [
          "@babel/preset-env",
          {
            module: false,
            targets: {
              browsers: '> 0.5%, ie >= 11',
            },
            useBuiltIns: 'usage',
            corejs: 3,
          }
        ]
      ]
    }),
    nodeResolve({
      preferBuiltins: false
    }),
    commonjs(),
    // uglify(),
    json(),
    nodePolyfills(),
    serve({
      open: false,
      host: 'localhost',
      port: 9000,
      contentBase: ''
    })
  ],
}
