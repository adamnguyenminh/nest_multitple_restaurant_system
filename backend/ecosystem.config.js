module.exports = {
  apps: [
    // -------------------------------------------------------------
    // 1. HTTP API SERVER (PRODUCER)
    // -------------------------------------------------------------
    {
      name: 'nestjs-restaurant-api',
      script: 'npm',
      args: 'run start:dev',
      instances: 1, // Dev mode bắt buộc để 1 instance
      exec_mode: 'fork', // Dev mode bắt buộc dùng fork
      watch: false, // Để false vì nest start --watch đã tự quản lý reload
      env: {
        NODE_ENV: 'development',
        PORT: 3000,
      },
      max_memory_restart: '1G',
    },

    // -------------------------------------------------------------
    // 2. RABBITMQ CONSUMER (WORKER)
    // -------------------------------------------------------------
    {
      name: 'restaurant-worker',
      script: 'npm',
      args: 'run start:worker',
      instances: 1, // Dev mode bắt buộc để 1 instance
      exec_mode: 'fork', // Dev mode bắt buộc dùng fork
      watch: false, // Để false vì nest start --watch đã tự quản lý reload
      env: {
        NODE_ENV: 'development',
      },
      max_memory_restart: '1G',
    },
  ],
};
