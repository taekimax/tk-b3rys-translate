import { defineConfig } from 'wxt';

export default defineConfig({
  outDir: 'dist',
  // @ts-expect-error extensionApi is a valid WXT option but not in older type definitions
  extensionApi: 'chrome',
  manifest: {
    name: 'b3rys translate',
    description:
      'Bilingual translation — keep the original text and show the translation right below it, on any web page and YouTube subtitles.',
    version: '0.5.15',
    permissions: ['storage', 'activeTab', 'nativeMessaging'],
    host_permissions: ['https://www.youtube.com/*', '<all_urls>'],
  },
});
