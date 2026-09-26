import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

// Tailor is local-first: the only network destination is the TypeSafe API.
const TYPESAFE_ORIGIN = 'https://api.typesafe.ai';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: ({ browser, mode }) => ({
    name: 'Tailor: resume fit for any job',
    short_name: 'Tailor',
    description:
      'Measure how well your resume fits the job you are looking at, skill by skill. Your resumes and API key stay in your browser.',
    permissions: [
      'storage', // resumes' settings, sealed API key
      'activeTab', // read the current page only when you click Measure
      'scripting', // inject the job reader on demand
      'alarms', // auto-lock the API key
      ...(browser === 'firefox' ? [] : ['sidePanel']),
    ],
    host_permissions: [`${TYPESAFE_ORIGIN}/*`],
    // Asked for at runtime, only if you choose "Allow on all job sites".
    optional_host_permissions: ['https://*/*', 'http://*/*'],
    action: { default_title: 'Measure job fit' },
    ...(mode === 'production'
      ? {
          content_security_policy: {
            extension_pages: [
              "default-src 'self'",
              "script-src 'self'",
              "object-src 'none'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "font-src 'self'",
              "worker-src 'self'",
              `connect-src 'self' ${TYPESAFE_ORIGIN}`,
              "base-uri 'none'",
              "frame-ancestors 'none'",
            ].join('; '),
          },
        }
      : {}),
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: { id: 'tailor@job-fit.local', strict_min_version: '128.0' },
          },
        }
      : {}),
  }),
});
