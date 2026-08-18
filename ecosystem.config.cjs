module.exports = {
  apps: [{
    name: 'baocaotuan',
    script: 'server.js',
    cwd: '/opt/baocaotuan',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
    },
    max_memory_restart: '300M',
  }],
};
