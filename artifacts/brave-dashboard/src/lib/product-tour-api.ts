import { customFetch } from "@workspace/api-client-react";

export type ProductTourPlatform = "mobile" | "desktop";
export type ProductTourStatus = "unseen" | "finished" | "dismissed";

export type ProductTourProgress = {
  status: ProductTourStatus;
  completedAt: string | null;
};

export function getProductTourProgress(
  platform: ProductTourPlatform,
): Promise<ProductTourProgress> {
  return customFetch<ProductTourProgress>(
    `/api/product-tour?platform=${platform}`,
  );
}

export function saveProductTourProgress(
  platform: ProductTourPlatform,
  status: Exclude<ProductTourStatus, "unseen">,
): Promise<ProductTourProgress> {
  return customFetch<ProductTourProgress>("/api/product-tour", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ platform, status }),
  });
}