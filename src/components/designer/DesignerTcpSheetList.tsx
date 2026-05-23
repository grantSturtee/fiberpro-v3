"use client";

// Client wrapper around the shared TcpSheetList. Exists so a Server Component
// (designer project page) can pass only serializable props across the RSC
// boundary; the per-row delete control is wired up here on the client where
// passing a render callback into another Client Component is legal.

import { TcpSheetList, type TcpSheetListItem } from "@/components/shared/TcpSheetList";
import { DeleteTCPFileForm } from "@/components/designer/DeleteTCPFileForm";

type Props = {
  projectId: string;
  files: TcpSheetListItem[];
  canReorder: boolean;
  canDelete: boolean;
};

export function DesignerTcpSheetList({ projectId, files, canReorder, canDelete }: Props) {
  return (
    <TcpSheetList
      projectId={projectId}
      files={files}
      canReorder={canReorder}
      renderDelete={
        canDelete
          ? (file) => (
              <DeleteTCPFileForm
                fileId={file.id}
                projectId={projectId}
                fileName={file.file_name}
              />
            )
          : undefined
      }
    />
  );
}
