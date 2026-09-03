import { useState, useCallback } from "react";
import type { UppyFile } from "@uppy/core";

interface UploadMetadata {
  name: string;
  size: number;
  contentType: string;
}

interface UploadResponse {
  uploadURL: string;
  objectPath: string;
  metadata: UploadMetadata;
}

interface UseUploadOptions {
  /** Base path where object storage routes are mounted (default: "/api/storage") */
  basePath?: string;
  onSuccess?: (response: UploadResponse) => void;
  onError?: (error: Error) => void;
}

/**
 * React hook for handling file uploads with presigned URLs.
 *
 * This hook implements the two-step presigned URL upload flow:
 * 1. Request a presigned URL from your backend (sends JSON metadata, NOT the file)
 * 2. Upload the file directly to the presigned URL
 *
 * @example
 * ```tsx
 * function FileUploader() {
 *   const { uploadFile, isUploading, error } = useUpload({
 *     onSuccess: (response) => {
 *       console.log("Uploaded to:", response.objectPath);
 *     },
 *   });
 *
 *   const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
 *     const file = e.target.files?.[0];
 *     if (file) {
 *       await uploadFile(file);
 *     }
 *   };
 *
 *   return (
 *     <div>
 *       <input type="file" onChange={handleFileChange} disabled={isUploading} />
 *       {isUploading && <p>Uploading...</p>}
 *       {error && <p>Error: {error.message}</p>}
 *     </div>
 *   );
 * }
 * ```
 */
export function useUpload(options: UseUploadOptions = {}) {
  const basePath = options.basePath ?? "/api/storage";
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [progress, setProgress] = useState(0);

  const requestUploadUrl = useCallback(
    async (file: File): Promise<UploadResponse> => {
      const response = await fetch(`${basePath}/uploads/request-url`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: file.name,
          size: file.size,
          contentType: file.type || "application/octet-stream",
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const message =
          (errorData && typeof errorData.error === "string" && errorData.error) ||
          (response.status === 413
            ? "File is too large to upload."
            : response.status === 415
              ? "This file type is not supported."
              : "Failed to get upload URL");
        throw new Error(message);
      }

      return response.json();
    },
    [basePath]
  );

  const uploadToPresignedUrl = useCallback(
    (file: File, uploadURL: string): Promise<void> =>
      // XHR rather than fetch: fetch cannot report upload progress, and a bar
      // that sits at 30% and then jumps to 100% is worse than no bar at all on
      // the slow connections students actually upload from.
      new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", uploadURL, true);
        xhr.setRequestHeader(
          "Content-Type",
          file.type || "application/octet-stream"
        );
        xhr.upload.onprogress = (event) => {
          if (!event.lengthComputable) return;
          // 5-99. 100 is claimed only once storage has accepted the body, so
          // the bar never reads complete while the request is still in flight.
          setProgress(
            Math.min(99, 5 + Math.round((event.loaded / event.total) * 94))
          );
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error("Failed to upload file to storage"));
        };
        xhr.onerror = () =>
          reject(new Error("Failed to upload file to storage"));
        xhr.onabort = () => reject(new Error("Upload cancelled"));
        xhr.send(file);
      }),
    []
  );

  const uploadFile = useCallback(
    async (file: File): Promise<UploadResponse | null> => {
      setIsUploading(true);
      setError(null);
      setProgress(0);

      try {
        setProgress(2);
        const uploadResponse = await requestUploadUrl(file);

        setProgress(5);
        await uploadToPresignedUrl(file, uploadResponse.uploadURL);

        setProgress(100);
        options.onSuccess?.(uploadResponse);
        return uploadResponse;
      } catch (err) {
        const error = err instanceof Error ? err : new Error("Upload failed");
        setError(error);
        options.onError?.(error);
        return null;
      } finally {
        setIsUploading(false);
      }
    },
    [requestUploadUrl, uploadToPresignedUrl, options]
  );

  const getUploadParameters = useCallback(
    async (
      file: UppyFile<Record<string, unknown>, Record<string, unknown>>
    ): Promise<{
      method: "PUT";
      url: string;
      headers?: Record<string, string>;
    }> => {
      const response = await fetch(`${basePath}/uploads/request-url`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: file.name,
          size: file.size,
          contentType: file.type || "application/octet-stream",
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const message =
          (errorData && typeof errorData.error === "string" && errorData.error) ||
          (response.status === 413
            ? "File is too large to upload."
            : response.status === 415
              ? "This file type is not supported."
              : "Failed to get upload URL");
        throw new Error(message);
      }

      const data = await response.json();
      return {
        method: "PUT",
        url: data.uploadURL,
        headers: { "Content-Type": file.type || "application/octet-stream" },
      };
    },
    []
  );

  return {
    uploadFile,
    getUploadParameters,
    isUploading,
    error,
    progress,
  };
}
