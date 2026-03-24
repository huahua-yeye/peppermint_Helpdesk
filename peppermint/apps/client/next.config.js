// next.config.js
const withPlugins = require('next-compose-plugins');
const removeImports = require('next-remove-imports')();
const nextTranslate = require('next-translate');
const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: false,
});

module.exports = withPlugins(
  [removeImports, nextTranslate, withPWA],
  {
    reactStrictMode: false,
    swcMinify: true,
    output: 'standalone',

    async rewrites() {
      let apiBase =
        process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5003';
      apiBase = apiBase.replace(/\/$/, '');
      if (!/^https?:\/\//i.test(apiBase)) {
        apiBase = /localhost/i.test(apiBase)
          ? `http://${apiBase}`
          : `https://${apiBase}`;
      }
      return [
        {
          source: '/api/v1/:path*',
          destination: `${apiBase}/api/v1/:path*`,
        },
      ];
    },
  }
);
