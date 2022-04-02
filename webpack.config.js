const path = require('path')
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
    }
}