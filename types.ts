
export type AspectRatio = '1:1' | '9:16' | '16:9';

export interface GeneratedImage {
  prompt: string;
  src: string;
}

export interface ReferenceImage {
  file: File;
  base64: string;
}