module.exports = {
  apps: [
    {
      name: "song-toolkit",
      script: "dist/index.js",
      cwd: __dirname,
      env: { PORT: 3006 },
      env_production: { PORT: 3006 },
    },
  ],
};
