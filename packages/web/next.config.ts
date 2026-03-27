import type { NextConfig } from 'next';

const config: NextConfig = {
  transpilePackages: ['@get-cauldron/shared', '@get-cauldron/engine'],
  experimental: { serverActions: { bodySizeLimit: '2mb' } },
  webpack: (webpackConfig) => {
    webpackConfig.resolve ??= {};
    webpackConfig.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
      '.cjs': ['.cts', '.cjs'],
    };
    return webpackConfig;
  },
};

export default config;
