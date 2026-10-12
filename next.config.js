/** @type {import('next').NextConfig} */
// Static export: the app is plain files and can sit on any static host.
// On GitHub Pages the site lives under /<repo>/, so the workflow sets
// NEXT_PUBLIC_BASE_PATH. On Vercel or a custom domain leave it empty.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
const nextConfig = {
  reactStrictMode: true,
  output: "export",
  trailingSlash: true,
  basePath,
  images: { unoptimized: true },
};
module.exports = nextConfig;
