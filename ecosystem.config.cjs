module.exports = {
  apps: [
    {
      name: 'madrid-quotes',
      script: 'npx',
      args: 'tsx --env-file=.env server/index.ts',
      cwd: __dirname,
    },
    {
      name: 'madrid-worker',
      script: 'npx',
      args: 'tsx --env-file=.env server/worker.ts',
      cwd: __dirname,
    },
  ],
};
