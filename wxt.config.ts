import { defineConfig } from 'wxt';
import extensionKey from './extension-public-key.json';

export default defineConfig({
  outDir: 'dist',
  // @ts-expect-error extensionApi is a valid WXT option but not in older type definitions
  extensionApi: 'chrome',
  manifest: {
    name: 'web-translate',
    description:
      'Bilingual web translation — keep the original text and show the translation right below it, on web pages and YouTube subtitles.',
    version: '0.6.0',
    key: extensionKey.publicKey,
    permissions: ['storage', 'activeTab', 'nativeMessaging'],
    host_permissions: ['https://www.youtube.com/*', '<all_urls>'],
  },
});
