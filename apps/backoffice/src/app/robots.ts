import type { MetadataRoute } from "next";

// Private automation dashboard — blokir semua crawler (jangan pernah terindeks).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: "/" },
  };
}
