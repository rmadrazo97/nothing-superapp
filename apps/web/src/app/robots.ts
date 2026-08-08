import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  return {
    rules: [
      // Public marketing surface is crawlable.
      { userAgent: '*', allow: '/', disallow: ['/app', '/auth', '/api'] },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
