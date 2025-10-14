declare module 'html2canvas' {
  export type Html2CanvasOptions = {
    scale?: number;
    useCORS?: boolean;
    backgroundColor?: string;
  } & Record<string, unknown>;

  export default function html2canvas(
    element: HTMLElement,
    options?: Html2CanvasOptions,
  ): Promise<HTMLCanvasElement>;
}

declare module 'jspdf' {
  type Orientation = 'p' | 'portrait' | 'l' | 'landscape';
  type Unit = 'pt' | 'mm' | 'cm' | 'in';
  type Format = 'a4' | string | [number, number];

  export class jsPDF {
    constructor(orientation?: Orientation, unit?: Unit, format?: Format);
    readonly internal: {
      readonly pageSize: {
        getWidth(): number;
        getHeight(): number;
      };
    };
    addImage(
      imageData: string,
      format: 'PNG' | 'JPEG' | string,
      x: number,
      y: number,
      width: number,
      height: number,
      alias?: string,
      compression?: 'FAST' | 'NONE' | string,
    ): void;
    addPage(): void;
    save(filename: string): void;
  }
}
