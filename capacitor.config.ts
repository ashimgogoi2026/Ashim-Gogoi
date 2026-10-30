/**
 * Capacitor Configuration File
 * Used to package the web platform into an Android Studio Gradle workspace
 */
const config = {
  appId: 'com.protogrow.app',
  appName: 'Influencer Manager',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    allowNavigation: [
      '*.run.app',
      'localhost',
      '127.0.0.1'
    ]
  }
};

export default config;
