import { defineConfig } from 'wxt';

// This public key pins the unpacked extension ID across machines. The matching
// private key is kept outside the repository for optional CRX signing.
const extensionPublicKey =
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAlg7KhySIGwdWCAOWKRDk/71zQzvIY789epj/u7hb5OcFPJ8T7nOVkOAh6susIpFYoHnFFpEVCOt/evzaP3nf0lEGr8ou7Vq9BNgVN4JE/pt69dJOiD1FnqooouZsWurna/V4eXoqTIvdUDj42a7+pOpV96UCunPrTD53D769hvhTa0r7st7rQEhWq+trLsKi2WAGVT8/tSRBWqM+46L85ckGq/J0+wV1iKKpzg+LK7TRwAtMUBRKFE5WQl8K4AwKebvR62X3ldP4D3+GNGkFroIVXh0H7h7Mkp33w5m9VqDSTJfWBoiJbiPR/CIbkjJEkVSQlm1+lFKiNxnFFCP5zQIDAQAB';

export default defineConfig({
  outDir: 'dist',
  // @ts-expect-error extensionApi is a valid WXT option but not in older type definitions
  extensionApi: 'chrome',
  manifest: {
    key: extensionPublicKey,
    name: 'b3rys translate',
    description:
      'Bilingual translation — keep the original text and show the translation right below it, on any web page and YouTube subtitles.',
    version: '0.5.15',
    permissions: ['storage', 'activeTab', 'nativeMessaging'],
    host_permissions: ['https://www.youtube.com/*', '<all_urls>'],
  },
});
