/** PM2 process config — run from repo root: pm2 start ecosystem.config.js */
module.exports = {
  apps: [
    {
      name: 'ap-api',
      cwd: __dirname,
      script: 'backend/server.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 30,
      min_uptime: '5s',
      exp_backoff_restart_delay: 200,
      max_memory_restart: '512M',
      listen_timeout: 20000,
      kill_timeout: 8000,
      watch: false,
      merge_logs: true,
      time: true,
      env: {
        NODE_ENV: 'production',
        PORT: '5000',
        /* Fast restarts — migrations run via deploy, not every boot */
        SKIP_DB_SCHEMA_ENSURE: 'true',
      },
      node_args: '--max-old-space-size=384',
    },
  ],
};
