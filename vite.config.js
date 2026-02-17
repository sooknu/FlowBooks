import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		react(),
	],
	server: {
		cors: true,
		headers: {
			'Cross-Origin-Embedder-Policy': 'credentialless',
		},
		allowedHosts: true,
		proxy: {
			'/api': {
				target: 'http://localhost:3002',
				changeOrigin: true,
			},
			'/uploads': {
				target: 'http://localhost:3002',
				changeOrigin: true,
			},
		},
	},
	resolve: {
		extensions: ['.jsx', '.js', '.tsx', '.ts', '.json', ],
		alias: {
			'@': path.resolve(__dirname, './src'),
		},
	},
	build: {
		rollupOptions: {
			output: {
				manualChunks(id) {
					if (id.includes('node_modules/react-dom') ||
						id.includes('node_modules/react/') ||
						id.includes('node_modules/scheduler')) {
						return 'react-vendor';
					}
					if (id.includes('node_modules/framer-motion') ||
						id.includes('node_modules/@radix-ui') ||
						id.includes('node_modules/cmdk') ||
						id.includes('node_modules/class-variance-authority') ||
						id.includes('node_modules/clsx') ||
						id.includes('node_modules/tailwind-merge')) {
						return 'ui-vendor';
					}
					if (id.includes('node_modules/@tanstack') ||
						id.includes('node_modules/better-auth')) {
						return 'data-vendor';
					}
					if (id.includes('node_modules/@stripe')) {
						return 'stripe-vendor';
					}
					if (id.includes('node_modules/@paypal')) {
						return 'paypal-vendor';
					}
				}
			}
		}
	}
});
