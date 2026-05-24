declare module "html-minifier-terser" {
  export function minify(html: string, options?: Record<string, unknown>): Promise<string>;
}
