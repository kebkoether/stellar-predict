/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  // Produce a standalone build for Docker (smaller image, no node_modules needed)
  output: process.env.DOCKER_BUILD === '1' ? 'standalone' : undefined,
  webpack: (config) => {
    config.externals.push('pino-pretty', 'lokijs', 'encoding')
    return config
  },
}

module.exports = nextConfig
