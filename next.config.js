/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV === 'development';

const contentSecurityPolicy = (isDev
  ? `
    default-src 'self';
    script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' https://unpkg.com https://*.ribaunt.com;
    script-src-attr 'none';
    style-src 'self' 'unsafe-inline';
    img-src 'self' data: https: blob: https://api.dicebear.com https://i.ytimg.com https://upload.wikimedia.org https://imgs.search.brave.com;
    font-src 'self' data:;
    connect-src 'self' https://*.tekir.co https://*.convex.cloud https://*.convex.site https://eu.i.posthog.com https://*.polar.sh https://*.wikipedia.org wss://*.convex.cloud wss://*.convex.site blob:;
    worker-src 'self' blob:;
    form-action 'self';
    base-uri 'self';
    object-src 'none';
    frame-src 'self' https://status.tekir.co https://*.polar.sh;
    frame-ancestors 'self' https://status.tekir.co https://*.posthog.com https://posthog.com;
  `
  : `
    default-src 'self';
    script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' https://*.ribaunt.com;
    script-src-attr 'none';
    style-src 'self' 'unsafe-inline';
    img-src 'self' data: https: blob: https://api.dicebear.com https://i.ytimg.com https://upload.wikimedia.org https://imgs.search.brave.com;
    font-src 'self' data:;
    connect-src 'self' https://*.tekir.co https://*.convex.cloud https://*.convex.site https://eu.i.posthog.com https://*.polar.sh https://*.wikipedia.org wss://*.convex.cloud wss://*.convex.site blob:;
    worker-src 'self' blob:;
    form-action 'self';
    base-uri 'self';
    object-src 'none';
    frame-src 'self' https://status.tekir.co https://*.polar.sh;
    frame-ancestors 'self' https://status.tekir.co https://*.posthog.com https://posthog.com;
  `
)
  .replace(/\s{2,}/g, ' ')
  .trim();

const extraImageHosts = (process.env.NEXT_PUBLIC_IMAGE_HOSTS || '')
  .split(',')
  .map((host) => host.trim())
  .filter(Boolean);

const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'api.dicebear.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'i.ytimg.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'upload.wikimedia.org',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'imgs.search.brave.com',
        port: '',
        pathname: '/**',
      },
      ...extraImageHosts.map((hostname) => ({
        protocol: 'https',
        hostname,
        port: '',
        pathname: '/**',
      })),
    ],
    minimumCacheTTL: 0,
  },

  // Only transpile packages that truly need it (undici for Node fetch in older environments)
  transpilePackages: ['undici'],

  experimental: {
    turbopackUseBuiltinBabel: true,
  },

  allowedDevOrigins: ['127.0.0.1'],

  turbopack: {
    root: __dirname,
  },

  // Set build-time environment variables
  env: {
    // Auto-generate i18n cache version if not explicitly set
    NEXT_PUBLIC_I18N_CACHE_VERSION: process.env.NEXT_PUBLIC_I18N_CACHE_VERSION || `v${Date.now()}`,
    // Vercel deployment ID and Git SHA for tracking
    NEXT_PUBLIC_DEPLOYMENT_ID: process.env.VERCEL_DEPLOYMENT_ID || 'local',
    NEXT_PUBLIC_GIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA || 'dev',
  },

  skipTrailingSlashRedirect: true,

  async rewrites() {
    return [
      {
        source: '/metadata/session-capture.js',
        destination: 'https://eu-assets.i.posthog.com/static/posthog-recorder.js',
      },
      {
        source: '/metadata/click-signals.js',
        destination: 'https://eu-assets.i.posthog.com/static/dead-clicks-autocapture.js',
      },
      {
        source: '/metadata/posthog-recorder.js.map',
        destination: 'https://eu-assets.i.posthog.com/static/posthog-recorder.js.map',
      },
      {
        source: '/metadata/dead-clicks-autocapture.js.map',
        destination: 'https://eu-assets.i.posthog.com/static/dead-clicks-autocapture.js.map',
      },
      {
        source: '/metadata/static/:path*',
        destination: 'https://eu-assets.i.posthog.com/static/:path*',
      },
      {
        source: '/metadata/array/:path*',
        destination: 'https://eu-assets.i.posthog.com/array/:path*',
      },
      {
        source: '/metadata/:path*',
        destination: 'https://eu.i.posthog.com/:path*',
      },
      {
        source: '/ph/static/:path*',
        destination: 'https://eu-assets.i.posthog.com/static/:path*',
      },
      {
        source: '/ph/array/:path*',
        destination: 'https://eu-assets.i.posthog.com/array/:path*',
      },
      {
        source: '/ph/:path*',
        destination: 'https://eu.i.posthog.com/:path*',
      }
    ];
  },

  webpack: (config, { isServer }) => {
    return config;
  },

  async headers() {
    const cacheHeaders = isDev ? [] : [
      {
        // Static JS/CSS assets with content hash - cache forever
        source: '/:path*.(js|css|json|woff|woff2|ttf|otf)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable'
          }
        ]
      },
      {
        // Static assets in _next directory (Next.js build artifacts)
        source: '/_next/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable'
          }
        ]
      }
    ];

    return [
      ...cacheHeaders,
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: contentSecurityPolicy
          },
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on'
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block'
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin'
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()'
          }
        ]
      }
    ];
  }
};

module.exports = nextConfig;
