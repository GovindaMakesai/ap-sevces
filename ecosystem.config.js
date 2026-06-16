/** PM2 process config — run from repo root: pm2 start ecosystem.config.js */
module.exports = {
  apps: [
    {
      name: 'ap-api',
      cwd: __dirname,
      script: 'backend/server.js',
      instances: 1,
      autorestart: true,
      max_restarts: 15,
      min_uptime: '10s',
      listen_timeout: 30000,
      kill_timeout: 10000,
      env: {
        NODE_ENV: 'production',
        PORT: '5000',
      },
    },
  ],
};
