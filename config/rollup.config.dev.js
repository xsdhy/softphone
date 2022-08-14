import typescript from '@rollup/plugin-typescript';
import babel from "@rollup/plugin-babel";
import commonjs from "@rollup/plugin-commonjs";
import pkg from '../package.json'
import nodeResolve from "@rollup/plugin-node-resolve";
import json from "@rollup/plugin-json";
import nodePolyfills from 'rollup-plugin-polyfill-node';
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
      name: 'cti'
    },
  ],
  plugins: [
    typescript(),
    babel({
      exclude: 'node_modules/**',
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
    nodeResolve({preferBuiltins: false}),
    commonjs(),
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
