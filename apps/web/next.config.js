//@ts-check

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { composePlugins, withNx } = require('@nx/next');

/**
 * @type {import('@nx/next/plugins/with-nx').WithNxOptions}
 **/
const nextConfig = {
  distDir: process.env.VERCEL ? 'dist/apps/web/.next' : '.next',
  output: 'standalone',
  nx: {},
};

const plugins = [
  withNx,
];

if (process.env.VERCEL) {
  module.exports = nextConfig;
} else {
  module.exports = composePlugins(...plugins)(nextConfig);
}
