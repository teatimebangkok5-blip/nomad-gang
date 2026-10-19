// app.json holds the app's config; this file only adds what depends on local files.
// Phone notifications on Android need the Firebase file google-services.json (README: "Phone notifications").
// Until it's there, the app builds without it and simply can't get a push token.
const fs = require('fs');
const path = require('path');

module.exports = ({ config }) => {
  const googleServices = path.join(__dirname, 'google-services.json');
  if (fs.existsSync(googleServices)) {
    config.android = { ...config.android, googleServicesFile: './google-services.json' };
  }
  return config;
};
