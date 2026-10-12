import type { NextConfig } from 'next';
const config: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  distDir: process.env.ITINERARY_SMOKE_TEST === '1' ? '.next-smoke' : '.next',
};
export default config;
