// @ts-check
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://mikrosuite.com",
  base: "/docs/docs",
  integrations: [
    starlight({
      title: "MikroDocs Docs",
      description: "Documentation for the local-first MikroDocs writing app.",
      favicon: "/favicon.svg",
      customCss: ["./src/styles/custom.css"],
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/mikaelvesavuori/mikrodocs",
        },
      ],
      sidebar: [
        {
          label: "Getting Started",
          items: [
            { label: "What is MikroDocs?", slug: "getting-started/intro" },
            { label: "Installation", slug: "getting-started/installation" },
          ],
        },
        {
          label: "Guides",
          items: [
            { label: "Configuration", slug: "guides/configuration" },
            { label: "Authentication", slug: "guides/authentication" },
            { label: "Writing in MikroDocs", slug: "guides/writing" },
            { label: "Import and Export", slug: "guides/import-export" },
            { label: "Local Data and Backups", slug: "guides/local-data" },
            { label: "Deployment", slug: "guides/deployment" },
          ],
        },
        {
          label: "Reference",
          items: [
            { label: "Comparison", slug: "reference/comparison" },
            { label: "Privacy and Security", slug: "reference/privacy-security" },
            { label: "Architecture", slug: "reference/architecture" },
          ],
        },
      ],
    }),
  ],
});
