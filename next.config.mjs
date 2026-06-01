

const nextConfig = {
  webpack: (config, { isServer }) => {
    if (isServer) {
      // pdf-parse uses test/ directory that webpack chokes on
      config.externals = [...(config.externals || []), 'pdf-parse']
    }
    return config
  },
  experimental: {
    serverComponentsExternalPackages: ['pdf-parse'],
  },
}

export default nextConfig
