// Expo app config. Values that differ per build environment come from
// EXPO_PUBLIC_* env vars so a fresh clone runs without editing this file.
module.exports = {
  expo: {
    name: "Tie-Down Roping",
    slug: "tiedown",
    scheme: "tiedown",
    version: '0.1.0',
    orientation: 'portrait',
    userInterfaceStyle: 'dark',
    newArchEnabled: true,
    splash: {
      resizeMode: 'contain',
      backgroundColor: "#12100e",
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: "pro.tiedown.app",
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
        NSCameraUsageDescription: 'Record your runs so TieDown can analyse them.',
        NSMicrophoneUsageDescription: 'Capture audio alongside your run video.',
        NSPhotoLibraryUsageDescription: 'Pick a run video to analyse.',
      },
    },
    android: {
      package: "pro.tiedown.app",
      adaptiveIcon: {
        backgroundColor: "#12100e",
      },
      edgeToEdgeEnabled: true,
    },
    web: { bundler: 'metro', output: 'static' },
    plugins: ['expo-router', 'expo-video'],
    experiments: { typedRoutes: true },
    extra: {
      eas: {
        projectId: "930ee479-27f6-4978-84fa-0c4f8ca2c4f1"
      },
      domain: "tiedown.pro",
      eventType: "tiedown",
    },
  },
};
