import type { NextConfig } from 'next';

const config: NextConfig = {
  transpilePackages: ['@get-cauldron/shared', '@get-cauldron/engine'],
  experimental: { serverActions: { bodySizeLimit: '2mb' } },
  // Webpack extensionAlias: resolve .js imports to TypeScript source files.
  // Required because workspace packages use Node16 moduleResolution with
  // explicit .js extensions in relative imports, but source files are .ts/.tsx.
  // Use --webpack flag in build/dev scripts to opt out of Turbopack.
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
