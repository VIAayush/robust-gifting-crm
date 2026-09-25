import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co', pathname: '/storage/v1/object/public/**' },
    ],
    // Every Storage upload path embeds Date.now() and is written with
    // upsert:false (see scripts/optimize-active-product-images.mjs and the
    // product/company upload actions) - a given image URL's bytes never
    // change after creation, a new upload always gets a new path instead.
    // Safe to cache aggressively since there's no in-place-mutation case to
    // go stale against.
    minimumCacheTTL: 2592000,
  },
  experimental: {
    serverActions: {
      // Server Actions default to 1MB, which a large product CSV (or one with
      // several attached photos) can exceed. The CSV importer also chunks its
      // commit into small batches so a single request never risks this limit
      // or the platform's function-timeout on very large catalogues.
      bodySizeLimit: '8mb',
    },
  },
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        source: '/manifest.webmanifest',
        headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }],
      },
    ]
  },
  async rewrites() {
    return [
      { source: '/dashboard', destination: '/crm/dashboard' },
      { source: '/companies', destination: '/crm/companies' },
      { source: '/companies/:path*', destination: '/crm/companies/:path*' },
      { source: '/contacts', destination: '/crm/contacts' },
      { source: '/leads', destination: '/crm/leads' },
      { source: '/leads/:path*', destination: '/crm/leads/:path*' },
      { source: '/campaigns', destination: '/crm/campaigns' },
      { source: '/requirements', destination: '/crm/requirements' },
      { source: '/requirements/:path*', destination: '/crm/requirements/:path*' },
      { source: '/products', destination: '/crm/products' },
      { source: '/products/:path*', destination: '/crm/products/:path*' },
      { source: '/mockups', destination: '/crm/mockups' },
      { source: '/quotations', destination: '/crm/quotations' },
      { source: '/quotations/:path*', destination: '/crm/quotations/:path*' },
      { source: '/orders', destination: '/crm/orders' },
      { source: '/orders/:path*', destination: '/crm/orders/:path*' },
      { source: '/suppliers', destination: '/crm/suppliers' },
      { source: '/printing-vendors', destination: '/crm/printing-vendors' },
      { source: '/courier-partners', destination: '/crm/courier-partners' },
      { source: '/invoices', destination: '/crm/invoices' },
      { source: '/invoices/:path*', destination: '/crm/invoices/:path*' },
      { source: '/payments', destination: '/crm/payments' },
      { source: '/receivables', destination: '/crm/receivables' },
      { source: '/reports', destination: '/crm/reports' },
      { source: '/activities', destination: '/crm/activities' },
      { source: '/team', destination: '/crm/team' },
      { source: '/settings', destination: '/crm/settings' },
      { source: '/audit-log', destination: '/crm/audit-log' },
      { source: '/my-work', destination: '/crm/my-work' },
      { source: '/department', destination: '/crm/department' },
      { source: '/order-management', destination: '/crm/order-management' },
      { source: '/order-control-center', destination: '/crm/order-management' },
      { source: '/payables', destination: '/crm/payables' },
      { source: '/crm/my-team', destination: '/crm/team' },
      { source: '/crm/knowledge-center', destination: '/crm/knowledge' },
      { source: '/crm/learn-giffter', destination: '/crm/knowledge' },
      { source: '/gst-reports', destination: '/crm/gst-reports' },
      { source: '/crm/payment-receivables', destination: '/crm/receivables' },
      { source: '/crm/payments-payable', destination: '/crm/payables' },
      { source: '/crm/manual-payment', destination: '/crm/payments' },
    ];
  },
};

export default nextConfig;
