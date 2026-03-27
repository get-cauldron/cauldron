import type { NextConfig } from 'next';

const config: NextConfig = {
  transpilePackages: ['@cauldron/shared', '@cauldron/engine'],
  experimental: { serverActions: { bodySizeLimit: '2mb' } },
};

export default config;
