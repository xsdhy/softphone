const path = require('path')
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyPlugin = require('copy-webpack-plugin');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
module.exports = {
    mode:"none",
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'ctibar.js',
        library: 'Ctibar',
        libraryTarget: "umd"
    },
    devServer: {
        static: {
            directory: "./",
        },
        compress: true,
        port: 9000,
    },
    plugins: [
        new CleanWebpackPlugin(),
        new CopyPlugin({
            patterns: [
                { from: 'static', to: path.resolve(__dirname, 'dist/static') }
            ],
        }),
        new HtmlWebpackPlugin({
            template: './index.html',
            scriptLoading:'blocking',
        }),

    ],
}