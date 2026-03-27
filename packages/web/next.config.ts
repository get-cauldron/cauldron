import type { NextConfig } from 'next';

const config: NextConfig = {
  transpilePackages: ['@get-cauldron/shared', '@get-cauldron/engine'],
  experimental: { serverActions: { bodySizeLimit: '2mb' } },
};

export default config;
