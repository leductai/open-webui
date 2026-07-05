import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: [
    "ccdb-113-161-33-214.ngrok-free.app",
	  "localhost:3000",
  ],

  webpack(config) {
    config.module.rules.push({
      test: /pdf\.worker\.(min\.)?mjs$/,
      type: "asset/resource",
    });

    return config;
  },
};

export default withNextIntl(nextConfig);