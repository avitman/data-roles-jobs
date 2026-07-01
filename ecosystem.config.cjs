module.exports = {
  apps: [
    {
      name: 'data-jobs-bot',
      script: 'src/index.js',
      interpreter: 'node',
      env: {
        TZ: 'Asia/Jerusalem',
        NODE_ENV: 'production',
      },
      restart_delay: 5000,
      max_restarts: 10,
      watch: false,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
