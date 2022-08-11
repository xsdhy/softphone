import typescript from '@rollup/plugin-typescript';
import babel from "@rollup/plugin-babel";
import commonjs from "@rollup/plugin-commonjs";
import pkg from '../package.json'
import nodeResolve from "@rollup/plugin-node-resolve";
import {uglify} from "rollup-plugin-uglify";
import livereload from 'rollup-plugin-livereload'
import serve from 'rollup-plugin-serve'

import json from '@rollup/plugin-json'
import nodePolyfills from 'rollup-plugin-polyfill-node';

export default {
    input: "./src/index.ts",
    external: [
        "events",
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
        json(),
        nodeResolve({
            browser: true,
        }),

        nodePolyfills({
            include: ["events"]
        }),

        commonjs(),

        // babel({
        //     exclude: 'node_modules/**',
        //     externalHelpers: true,
        //     runtimeHelpers: true
        // }),

        typescript(),
        // uglify(),
        // livereload(),
        serve({
            open: false,
            host: 'localhost',
            port: 9000,
            contentBase: ''
        })
    ],
}
