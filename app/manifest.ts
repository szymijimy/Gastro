import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'GastroApp – Panel Lokalu',
    short_name: 'GastroApp',
    description: 'System zarządzania grafikami, obecnością i magazynem lokalu gastronomicznego',
    start_url: '/',
    display: 'standalone',
    background_color: '#f4f4f5',
    theme_color: '#18181b',
    orientation: 'portrait',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
