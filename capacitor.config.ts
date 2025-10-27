import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.AEAC.aura',
  appName: 'Aura',
  webDir: 'out',
  server: {
    url: 'https://main.d861vmdjlayxi.amplifyapp.com',
    cleartext: false,
  },
};

export default config;
