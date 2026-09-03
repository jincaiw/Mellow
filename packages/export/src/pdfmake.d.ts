declare module 'pdfmake/build/pdfmake' {
  interface PdfMake {
    fonts: Record<string, { normal: unknown; bold?: unknown; italics?: unknown; bolditalics?: unknown }>;
    vfs: Record<string, string>;
    virtualfs?: {
      writeFileSync(filename: string, content: Buffer): void;
      readFileSync(filename: string): Buffer;
      existsSync(filename: string): boolean;
    };
    createPdf(doc: unknown): {
      getBuffer(): Promise<Buffer>;
    };
  }
  const pdfMake: PdfMake;
  export default pdfMake;
}
