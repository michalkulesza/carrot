const isDevelopment = process.env.APP_VARIANT === "development";

module.exports = ({ config }) => {
  const name = isDevelopment ? "Carrot Dev" : config.name;
  const scheme = isDevelopment ? "carrot-dev" : config.scheme;
  const bundleIdentifier = isDevelopment
    ? "com.kulesza.carrot.dev"
    : config.ios.bundleIdentifier;
  const packageName = isDevelopment
    ? "com.kulesza.carrot.dev"
    : config.android.package;

  return {
    ...config,
    name,
    scheme,
    ios: {
      ...config.ios,
      bundleIdentifier,
    },
    android: {
      ...config.android,
      package: packageName,
    },
  };
};
