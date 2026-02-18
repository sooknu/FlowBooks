module.exports = {
  apps: [
    {
      name: 'FlowBooks-server',
      script: 'npx',
      args: 'tsx --env-file=.env server/index.ts',
      cwd: __dirname,
      node_args: '--max-old-space-size=384',
      max_memory_restart: '400M',
    },
    {
      name: 'FlowBooks-worker',
      script: 'npx',
      args: 'tsx --env-file=.env server/worker.ts',
      cwd: __dirname,
      node_args: '--max-old-space-size=256',
      max_memory_restart: '300M',
    },
  ],
};
