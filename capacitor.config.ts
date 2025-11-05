import type { CapacitorConfig } from '@capacitor/cli';

// Permite usar un servidor de desarrollo local en Android/iOS cuando se define CAP_DEV_URL.
// Ejemplos:
//  - Emulador Android:  http://10.0.2.2:3000
//  - Dispositivo físico: http://<tu-ip-local>:3000
const devUrl = process.env.CAP_DEV_URL;

const config: CapacitorConfig = {
  appId: 'com.AEAC.aura',
  appName: 'Aura',
  webDir: 'out',
  server: devUrl
    ? {
        url: devUrl,
        // Si es http (sin TLS), habilita cleartext para desarrollo
        cleartext: devUrl.startsWith('http://'),
      }
    : {
        // Por defecto, usa la URL desplegada en producción
        url: 'https://main.d861vmdjlayxi.amplifyapp.com',
        cleartext: false,
      },
};

export default config;
