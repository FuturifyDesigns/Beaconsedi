import type { ImgHTMLAttributes } from "react";
export function StarOfLife(props: ImgHTMLAttributes<HTMLImageElement>) {
  return <img src="/branding/beacon-sedi-logo.png" alt="Beacon Sedi" width={512} height={512} {...props} style={{ objectFit: "contain", ...props.style }} />;
}
