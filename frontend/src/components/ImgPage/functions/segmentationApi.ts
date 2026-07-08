import axios from "axios";

interface SegmentationLoadResponse {
  success: boolean;
  exists: boolean;
  source: "doctor" | "algorithm" | "none" | "error";
  path?: string;
  dimensions?: number[];
  positiveVoxelCount?: number;
  isEmptyMask?: boolean;
  scalarDataBase64?: string;
  message?: string;
}

interface SegmentationSavePayload {
  outputPath: string;
  dimensions: number[];
  spacing: number[];
  origin: number[];
  direction: number[];
  scalarDataBase64: string;
}

interface SegmentationExportPayload extends SegmentationSavePayload {
  exportPath: string;
}

const getSegmentationUrl = (seriesId: string) =>
  `http://localhost:4001/study/${encodeURIComponent(seriesId)}/segmentation`;

const loadSegmentation = async (
  seriesId: string,
  outputPath: string,
  source?: "doctor" | "algorithm"
): Promise<SegmentationLoadResponse> => {
  const response = await axios.get(getSegmentationUrl(seriesId), {
    params: { outputPath, source },
  });
  return response.data;
};

const saveSegmentation = async (
  seriesId: string,
  payload: SegmentationSavePayload
) => {
  const response = await axios.post(getSegmentationUrl(seriesId), payload);
  return response.data;
};

const exportSegmentation = async (
  seriesId: string,
  payload: SegmentationExportPayload
) => {
  const response = await axios.post(`${getSegmentationUrl(seriesId)}/export`, payload);
  return response.data;
};

export type {
  SegmentationLoadResponse,
  SegmentationSavePayload,
  SegmentationExportPayload,
};
export { loadSegmentation, saveSegmentation, exportSegmentation };
