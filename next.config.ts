import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    // Ensure server/RSC analysis does not try to bundle 'airtable' into Edge.
    serverComponentsExternalPackages: ['airtable'],
  },
};

export default nextConfig;
