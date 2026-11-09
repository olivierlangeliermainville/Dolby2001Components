import { defineConfig } from 'tsup'

export default defineConfig({
    entry: ['src/components/Accordion/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    external: ['react', 'react-dom', 'react/jsx-runtime'],
    banner: { js: '"use client";' },
    esbuildOptions(options) {
        options.jsx = 'automatic'
    },
})