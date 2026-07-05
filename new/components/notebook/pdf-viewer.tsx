"use client";

import dynamic from "next/dynamic";
import {Skeleton} from "@/components/ui/skeleton";

const PdfViewerClient = dynamic(
  () => import("./pdf-viewer-client").then((module) => module.PdfViewerClient),
  {
    ssr: false,
    loading: () => <Skeleton className="h-[28rem] w-full rounded-[1.6rem]" />
  }
);

export function PdfViewer({url, page}: {url: string; page?: number}) {
  return <PdfViewerClient url={url} page={page} />;
}
