import typescript from '@rollup/plugin-typescript';
import babel from "@rollup/plugin-babel";
import commonjs from "@rollup/plugin-commonjs";
import pkg from '../package.json'
import nodeResolve from "@rollup/plugin-node-resolve";
import {uglify} from "rollup-plugin-uglify";
import json from "@rollup/plugin-json";

export default {
  input: "./src/index.ts",
  external: [
    "jssip",
    "uuid"
  ],
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
    },
  ],
  plugins: [
    nodeResolve(),
    commonjs(),
    typescript(),
    babel(),
    uglify(),
    json(),
  ],
}
