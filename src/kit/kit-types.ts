// Each asset kit category stores quantised geometry in base64 chunks. Model parts refer to ranges within the decoded bytes.

/** A named socket for aligning model parts, with its position in asset kit metres. */
export interface KitSocket {
  name: string;
  position: number[];
}

/** One model part that can move independently. Most models have one part named main. */
export interface KitPart {
  name: string;
  /** Offset of the part origin within the model, in asset kit metres. */
  pivot: number[];
  bboxMin: number[];
  bboxMax: number[];
  vertexStart: number;
  vertexCount: number;
  indexStart: number;
  indexCount: number;
}

/** One model divided into parts, with bounds in asset kit metres. */
export interface KitModel {
  name: string;
  bboxMin: number[];
  bboxMax: number[];
  triangles: number;
  sockets: KitSocket[];
  parts: KitPart[];
}

export interface KitCategory {
  name: string;
  byteLength: number;
  vertexCount: number;
  indexCount: number;
  b64: string[];
  models: KitModel[];
}
