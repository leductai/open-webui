"use client";

import {Document, Page, pdfjs} from "react-pdf";

// Next.js does not automatically bundle the PDF.js Web Worker for react-pdf,
// so postinstall copies it to public/ and we point PDF.js at that static path.
pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

export function PdfViewerClient({url, page}: {url: string; page?: number}) {
  return (
    <Document file={url} className="overflow-auto">
      <Page pageNumber={page ?? 1} width={680} />
    </Document>
  );
}
