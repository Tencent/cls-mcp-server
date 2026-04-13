const path = require('path');
const nodeExternals = require('webpack-node-externals');
const webpack = require('webpack');

// 读取package.json获取版本信息
const packageJson = require('./package.json');

// 自定义插件来添加shebang
class ShebangPlugin {
  apply(compiler) {
    compiler.hooks.emit.tap('ShebangPlugin', (compilation) => {
      const assets = compilation.assets;

      Object.keys(assets).forEach((assetName) => {
        if (assetName === 'index.js') {
          const asset = assets[assetName];
          const source = asset.source();

          // 在文件开头添加shebang
          const newSource = `#!/usr/bin/env node
${source}`;

          compilation.assets[assetName] = {
            source: () => newSource,
            size: () => newSource.length
          };
        }
      });
    });
  }
}

module.exports = {
  // 设置为生产模式以优化输出
  mode: 'production',

  // 入口文件
  entry: './src/index.ts',

  // 输出配置
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'index.js',
    // 设置输出为CommonJS模块格式，适合Node.js环境
    libraryTarget: 'commonjs2',
    // 清理输出目录
    clean: true
  },

  // 目标环境为Node.js
  target: 'node',

  // 排除node_modules中的依赖，让它们作为外部依赖
  externals: [nodeExternals()],

  // 模块解析配置
  resolve: {
    extensions: ['.ts', '.js'],
    alias: {
      // 如果需要路径别名，可以在这里配置
    }
  },

  // 模块规则
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/
      }
    ]
  },

  // 插件配置
  plugins: [
    // 使用DefinePlugin注入环境变量
    new webpack.DefinePlugin({
      'process.env.CLS_MCP_SERVER_VERSION': JSON.stringify(packageJson.version)
    }),
    // 使用自定义插件来添加shebang
    new ShebangPlugin()
  ],

  // TypeScript配置
  stats: {
    errorDetails: true
  },

  // 优化配置
  optimization: {
    minimize: false, // 不压缩代码，便于调试
    // 分割代码块
    splitChunks: {
      chunks: 'all'
    }
  },

  // 开发工具配置
  devtool: 'source-map'
};
