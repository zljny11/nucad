import React, { useEffect, useState, useRef, useContext } from "react";
import { useAppSelector } from "../../redux/hooks";
import PubSub from "pubsub-js";
import ImgPageContext from "./functions/ImgPageContext";
import {
  RenderingEngine,
  Types,
  Enums,
  setVolumesForViewports,
  volumeLoader,
  getRenderingEngine,
  utilities as csUtils,
  cache,
  eventTarget,
} from "@cornerstonejs/core";
import * as cornerstoneTools from "@cornerstonejs/tools";
import {
  initDemo,
  setPetColorMapTransferFunctionForVolumeActor,
  setCtTransferFunctionForVolumeActor,
} from "./functions/helpers";
import {
  VolumeToolGroup,
  SQUARE_BRUSH_ERASE_STRATEGY,
  SQUARE_BRUSH_FILL_STRATEGY,
  setUpCameraSynchronizers,
  removeCameraSynchronizers,
  setToolPassiveFun,
} from "./functions/cornerstoneAddTools";
import { renderingEngineId, viewportIds } from "./functions/getConstant";
import { getEffectiveOutputPath } from "./functions/pathUtils";
import loadImages from "./functions/loadImages";
import {
  MASK_ACTIVE_SEGMENT_TOPIC,
  MASK_BRUSH_SIZE_TOPIC,
  MASK_BRUSH_SHAPE_TOPIC,
  MASK_EXPORT_TOPIC,
  MASK_FOCUS_SEGMENT_TOPIC,
  MASK_PERSISTED_TOPIC,
  MASK_RELOAD_TOPIC,
  MASK_REDO_TOPIC,
  MASK_SAVE_TOPIC,
  MASK_SET_MODE_TOPIC,
  MASK_STATE_TOPIC,
  MASK_TOGGLE_VISIBILITY_TOPIC,
  MASK_UNDO_TOPIC,
} from "./functions/maskEvents";
import {
  loadSegmentation,
  saveSegmentation,
  SegmentationSavePayload,
} from "./functions/segmentationApi";
import { safeWindowRequire } from "../../utils/electron";
import type { LesionMaskStat } from "./functions/lesionReportCache";
import type { SelectedSeries } from "./SeriesSelectorPanel";
// import axios from "axios";

const { ViewportType } = Enums;
const { CAMERA_MODIFIED, VOI_MODIFIED } = Enums.Events;
const { getImageSliceDataForVolumeViewport, windowLevel } = csUtils;
const {
  utilities,
  segmentation,
  Enums: csToolsEnums,
  BrushTool,
} = cornerstoneTools;
const { jumpToSlice } = utilities;
const { MouseBindings, Events: CsToolsEvents, SegmentationRepresentations } =
  csToolsEnums;
const { setBrushSizeForToolGroup } = utilities.segmentation;
const ipcRenderer = safeWindowRequire
  ? safeWindowRequire("electron").ipcRenderer
  : null;
const SEGMENTATION_VOLUME_PREFIX = "NUCAD_SEGMENTATION_VOLUME";
const BRUSH_STRATEGY = "FILL_INSIDE_CIRCLE";
const ERASE_STRATEGY = "ERASE_INSIDE_CIRCLE";
const DEFAULT_MASK_BRUSH_SIZE = 8;
const INITIAL_LESION_FOCUS_MAX_ATTEMPTS = 12;
const INITIAL_LESION_FOCUS_RETRY_MS = 160;
const INITIAL_LESION_FOCUS_SETTLE_REPLAYS = 4;
const LESION_EDIT_FOCUS_STORAGE_KEY = "nucad:lesionEditFocus";
type BrushShape = "circle" | "square";
type MaskReloadPayload = {
  source?: "doctor" | "algorithm";
};
let renderingEngine: RenderingEngine,
  elements: HTMLCollectionOf<Element>,
  volumes: Promise<Record<string, any>[]>,
  PET_AXIAL_Num = 0,
  PET_CORONAL_Num = 0,
  PET_SAGITTAL_Num = 0,
  PET_CT_Num = 0;

interface MaskToolbarStatePayload {
  ready: boolean;
  visible: boolean;
  source: "doctor" | "algorithm" | "empty" | "none" | "error";
  message: string;
  brushSize: number;
  dirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  mode: "none" | "brush" | "erase";
  brushShape: BrushShape;
}

interface MaskSessionState {
  segmentationId: string;
  segmentationRepresentationUID: string;
  segmentationVolumeId: string;
  referencedVolumeId: string;
  visible: boolean;
  ready: boolean;
  source: MaskToolbarStatePayload["source"];
  message: string;
  mode: MaskToolbarStatePayload["mode"];
  brushSize: number;
  brushShape: BrushShape;
  dirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  undoStack: Uint8Array[];
  redoStack: Uint8Array[];
  committedSnapshot: Uint8Array | null;
  savedSnapshot: Uint8Array | null;
  pendingHistory: boolean;
  historyTimer: ReturnType<typeof setTimeout> | null;
  suppressHistory: boolean;
}

interface MaskLoadingState {
  active: boolean;
  percent: number;
  text: string;
}

const createInitialMaskSessionState = (): MaskSessionState => ({
  segmentationId: "",
  segmentationRepresentationUID: "",
  segmentationVolumeId: "",
  referencedVolumeId: "",
  visible: true,
  ready: false,
  source: "none",
  message: "Mask not initialized",
  mode: "none",
  brushSize: DEFAULT_MASK_BRUSH_SIZE,
  brushShape: "circle",
  dirty: false,
  canUndo: false,
  canRedo: false,
  undoStack: [],
  redoStack: [],
  committedSnapshot: null,
  savedSnapshot: null,
  pendingHistory: false,
  historyTimer: null,
  suppressHistory: false,
});

const base64ToUint8Array = (base64: string) => {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
};

const uint8ArrayToBase64 = (data: Uint8Array) => {
  let binary = "";

  for (let i = 0; i < data.length; i += 0x8000) {
    const chunk = data.subarray(i, i + 0x8000);
    for (let j = 0; j < chunk.length; j += 1) {
      binary += String.fromCharCode(chunk[j]);
    }
  }

  return window.btoa(binary);
};

const cloneScalarData = (data: Uint8Array) => new Uint8Array(data);

const clampIndex = (value: number, size: number) => {
  if (!Number.isFinite(value) || size <= 0) {
    return 0;
  }

  return Math.min(Math.max(Math.round(value), 0), size - 1);
};

const jumpViewportToWorld = (
  viewport: Types.IVolumeViewport | undefined,
  jumpWorld: Types.Point3
) => {
  if (!viewport || !jumpWorld) {
    return;
  }

  const camera = viewport.getCamera();
  const focalPoint = camera?.focalPoint;
  const position = camera?.position;
  const normal = camera?.viewPlaneNormal;

  if (!focalPoint || !position || !normal) {
    return;
  }

  const delta: Types.Point3 = [
    jumpWorld[0] - focalPoint[0],
    jumpWorld[1] - focalPoint[1],
    jumpWorld[2] - focalPoint[2],
  ];
  const dot =
    delta[0] * normal[0] + delta[1] * normal[1] + delta[2] * normal[2];
  const projectedDelta: Types.Point3 = [
    normal[0] * dot,
    normal[1] * dot,
    normal[2] * dot,
  ];

  if (
    Math.abs(projectedDelta[0]) <= 1e-3 &&
    Math.abs(projectedDelta[1]) <= 1e-3 &&
    Math.abs(projectedDelta[2]) <= 1e-3
  ) {
    return;
  }

  viewport.setCamera({
    focalPoint: [
      focalPoint[0] + projectedDelta[0],
      focalPoint[1] + projectedDelta[1],
      focalPoint[2] + projectedDelta[2],
    ],
    position: [
      position[0] + projectedDelta[0],
      position[1] + projectedDelta[1],
      position[2] + projectedDelta[2],
    ],
  });
  viewport.render();
};

const parseIndexList = (value: string | null) =>
  (value || "")
    .match(/\d+(\.\d+)?/g)
    ?.map((imgIndex) => Math.round(parseFloat(imgIndex))) || [];

const getStoredInitialLesionFocus = () => {
  try {
    const value = window.sessionStorage.getItem(LESION_EDIT_FOCUS_STORAGE_KEY);
    if (!value) {
      return { lesionId: "", lesionLabel: NaN, imageIndexs: [] as number[] };
    }

    const parsedValue = JSON.parse(value);
    return {
      lesionId: parsedValue?.lesionId ? String(parsedValue.lesionId) : "",
      lesionLabel: Number(parsedValue?.lesionLabel),
      imageIndexs: parseIndexList(parsedValue?.imageIndexs || ""),
    };
  } catch (error) {
    return { lesionId: "", lesionLabel: NaN, imageIndexs: [] as number[] };
  }
};

const getViewportOrThrow = (viewportId: string) => {
  const viewport = renderingEngine.getViewport(viewportId) as Types.IVolumeViewport;

  if (!viewport) {
    throw new Error(`Viewport is not ready: ${viewportId}`);
  }

  return viewport;
};

const getViewportDimensionsOrThrow = (
  viewport: Types.IVolumeViewport,
  volumeId: string
) => {
  const imageData = viewport.getImageData?.(volumeId);

  if (!imageData) {
    throw new Error(`Volume image data is not ready: ${volumeId}`);
  }

  return imageData.dimensions;
};

const wheelEventListener = (
  viewportIds: string[],
  setPET_AXIAL_Index: React.Dispatch<React.SetStateAction<number>>,
  setPET_CORONAL_Index: React.Dispatch<React.SetStateAction<number>>,
  setPET_SAGITTAL_Index: React.Dispatch<React.SetStateAction<number>>,
  setPET_CT_Index: React.Dispatch<React.SetStateAction<number>>
) => {
  const handlers: Array<{ element: Element; handler: EventListener }> = [];

  Object.values(elements).forEach((element, index) => {
    // 监听鼠标滚轮滚动
    const handler = () => {
      const viewport = renderingEngine.getViewport(
        viewportIds[index]
      ) as Types.IVolumeViewport;
      if (viewport && getImageSliceDataForVolumeViewport(viewport)) {
        const newIndex =
          getImageSliceDataForVolumeViewport(viewport).imageIndex;
        switch (index) {
          case 0:
            setPET_AXIAL_Index(newIndex + 1);
            break;
          case 1:
            setPET_CORONAL_Index(newIndex + 1);
            break;
          case 2:
            setPET_SAGITTAL_Index(newIndex + 1);
            break;
          case 3:
            setPET_CT_Index(newIndex + 1);
            break;
          default:
            break;
        }
      }
    };

    element.addEventListener(CAMERA_MODIFIED, handler);
    handlers.push({ element, handler });
  });

  return handlers;
};

const initAndGetImageIds = async (
  renderingEngineId: string,
  inputPath: string,
  outputPath: string,
  volumeIds: string[],
  pflag: string,
  selectedSeries?: SelectedSeries | null
): Promise<Record<string, any>[]> => {
  await initDemo();
  renderingEngine =
    (getRenderingEngine(renderingEngineId) as RenderingEngine) ||
    new RenderingEngine(renderingEngineId);
  elements = document.getElementsByClassName("viewport");

  /* const axiosResult = await axios.post("http://localhost:4001/getPath", {
    inputPath,
    outputPath,
  });
  const path = axiosResult.data; */
  const path = selectedSeries
    ? [
        selectedSeries.ctPath,
        selectedSeries.petPath,
        "",
      ]
    : [
        inputPath.slice(0, inputPath.length - 2) + "CT",
        inputPath,
        outputPath + "/out/out",
      ];
  let imageIds: string[][] = [];
  if (selectedSeries || pflag === "2" || pflag === "6") {
    const imageIds_PET_IN = loadImages(path[1], "PET_IN");
    const imageIds_CT = loadImages(path[0], "CT");
    imageIds = [imageIds_PET_IN, imageIds_CT];
    PET_AXIAL_Num = imageIds_PET_IN.length;
    PET_CT_Num =
      imageIds_CT.length > imageIds_PET_IN.length
        ? imageIds_CT.length
        : imageIds_PET_IN.length;
  } else {
    const imageIds_PET_IN = loadImages(path[1], "PET_IN");
    const imageIds_PET_OUT = loadImages(path[2], "PET_OUT");
    const imageIds_CT = loadImages(path[0], "CT");
    imageIds = [imageIds_PET_IN, imageIds_PET_OUT, imageIds_CT];
    PET_AXIAL_Num = imageIds_PET_IN.length;
    PET_CT_Num =
      imageIds_CT.length > imageIds_PET_IN.length
        ? imageIds_CT.length
        : imageIds_PET_IN.length;
  }

  if (!imageIds.length || imageIds.some((group) => !group.length)) {
    throw new Error("No readable image files were found for the selected study.");
  }

  const volumes: Record<string, any>[] = [];
  for (let i = 0; i < imageIds.length; i++) {
    const volume = await volumeLoader.createAndCacheVolume(volumeIds[i], {
      imageIds: imageIds[i],
    });
    volumes.push(volume);
  }

  return new Promise((resolve, reject) => {
    resolve(volumes);
  });
};

const createViewportAndRender = async (
  elements: HTMLCollectionOf<Element>,
  renderingEngineId: string,
  renderingEngine: RenderingEngine,
  viewportIds: string[],
  volumeIds: string[],
  volumes: Record<string, any>[],
  pflag: string,
  selectedSeries?: SelectedSeries | null
) => {
  if (!elements || elements.length < 4) {
    throw new Error("Viewport DOM elements are not ready");
  }

  const viewportInput = [
    {
      viewportId: viewportIds[0],
      element: elements[0] as HTMLDivElement,
      type: ViewportType.ORTHOGRAPHIC,
      defaultOptions: {
        orientation: Enums.OrientationAxis.AXIAL,
      },
    },
    {
      viewportId: viewportIds[1],
      element: elements[1] as HTMLDivElement,
      type: ViewportType.ORTHOGRAPHIC,
      defaultOptions: {
        orientation: Enums.OrientationAxis.CORONAL,
      },
    },
    {
      viewportId: viewportIds[2],
      element: elements[2] as HTMLDivElement,
      type: ViewportType.ORTHOGRAPHIC,
      defaultOptions: {
        orientation: Enums.OrientationAxis.SAGITTAL,
      },
    },
    {
      viewportId: viewportIds[3],
      element: elements[3] as HTMLDivElement,
      type: ViewportType.ORTHOGRAPHIC,
      defaultOptions: {
        orientation: Enums.OrientationAxis.AXIAL,
      },
    },
  ];
  renderingEngine.setViewports(viewportInput);

  volumes.forEach((volume) => volume.load());
  const ctVolumeIndex = !selectedSeries && pflag === "1" ? 2 : 1;

  !selectedSeries && pflag === "1"
    ? await setVolumesForViewports(
        renderingEngine,
        [
          {
            volumeId: volumeIds[0],
          },
          {
            volumeId: volumeIds[1],
            callback: setPetColorMapTransferFunctionForVolumeActor,
          },
        ],
        [viewportIds[0], viewportIds[1], viewportIds[2]]
      )
    : await setVolumesForViewports(
        renderingEngine,
        [
          {
            volumeId: volumeIds[0],
          },
        ],
        [viewportIds[0], viewportIds[1], viewportIds[2]]
      );

  await setVolumesForViewports(
    renderingEngine,
    [
      {
        volumeId: volumeIds[ctVolumeIndex],
        callback: setCtTransferFunctionForVolumeActor,
      },
      {
        volumeId: volumeIds[0],
        callback: setPetColorMapTransferFunctionForVolumeActor,
      },
    ],
    [viewportIds[3]]
  );

  const viewport_PET_CT = renderingEngine.getViewport(
    viewportIds[3]
  ) as Types.IVolumeViewport;
  viewport_PET_CT.setProperties(
    {
      colormap: {
        name: "2hot",
      },
    },
    // @ts-ignore
    volumeIds[0]
  );

  viewportIds.forEach((viewportId) => {
    // 绑定工具组
    VolumeToolGroup.addViewport(viewportId, renderingEngineId);
  });

  setUpCameraSynchronizers("AXIAL");

  renderingEngine.render();
};

const changePET_CT_Num = (
  dimensions: number[],
  section: string,
  setPET_CT_Index: React.Dispatch<React.SetStateAction<number>>
) => {
  switch (section) {
    case "AXIAL":
      PET_CT_Num = dimensions[2];
      break;
    case "SAGITTAL":
      PET_CT_Num = dimensions[1];
      break;
    case "CORONAL":
      PET_CT_Num = dimensions[0];
      break;
    default:
      break;
  }
  setPET_CT_Index(Math.ceil(PET_CT_Num / 2));
};

interface ImgShowProps {
  volumeIds: string[];
  enableMaskEditing?: boolean;
  selectedSeries?: SelectedSeries | null;
}

interface WindowLevelState {
  width: number;
  center: number;
}

const defaultWindowLevelState: WindowLevelState = {
  width: 400,
  center: 40,
};

const initialWindowLevels = viewportIds.reduce<Record<string, WindowLevelState>>(
  (levels, viewportId) => {
    levels[viewportId] = defaultWindowLevelState;
    return levels;
  },
  {}
);

const formatWindowLevelValue = (value: number) => {
  if (!Number.isFinite(value)) {
    return "-";
  }

  return Math.round(value).toString();
};

const ImgShow: React.FC<ImgShowProps> = (props) => {
  const patientInfo = useAppSelector((state) => state.patient.patientInfo);
  const { seriesId, pname, scanTime, pID, inputPath, outputPath, pflag } =
    patientInfo;
  const effectiveOutputPath = getEffectiveOutputPath(outputPath, inputPath);
  const { volumeLoaded } = useContext(ImgPageContext);
  const { volumeIds, enableMaskEditing = false, selectedSeries = null } = props;
  const ctVolumeIndex = !selectedSeries && pflag === "1" ? 2 : 1;
  const showLoadingProgress = !enableMaskEditing;
  const [PET_AXIAL_Index, setPET_AXIAL_Index] = useState(0);
  const [PET_CORONAL_Index, setPET_CORONAL_Index] = useState(0);
  const [PET_SAGITTAL_Index, setPET_SAGITTAL_Index] = useState(0);
  const [PET_CT_Index, setPET_CT_Index] = useState(0);
  const [MPR, setMPR] = useState("AXIAL");
  const [maskBanner, setMaskBanner] = useState("");
  const [windowLevels, setWindowLevels] =
    useState<Record<string, WindowLevelState>>(initialWindowLevels);
  const [maskLoading, setMaskLoading] = useState<MaskLoadingState>({
    active: showLoadingProgress,
    percent: 1,
    text: "Loading image data...",
  });
  const imgShowRef = useRef<HTMLDivElement | null>(null);
  const preMPR = useRef("AXIAL");
  const loadTokenRef = useRef(0);
  const maskSessionRef = useRef<MaskSessionState>(createInitialMaskSessionState());
  const initialLesionFocusApplied = useRef(false);
  const initialLesionFocusAttempts = useRef(0);
  const initialLesionFocusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeLesionEditTargetRef = useRef({ lesionId: "", lesionLabel: "" });
  const pendingMaskReloadSource = useRef<"doctor" | "algorithm" | undefined>(
    undefined
  );

  const setMaskLoadingProgress = (percent: number, text: string) => {
    if (!showLoadingProgress) {
      return;
    }

    setMaskLoading({
      active: true,
      percent,
      text,
    });
  };

  const finishMaskLoadingProgress = () => {
    if (!showLoadingProgress) {
      return;
    }

    setMaskLoading((previous) => ({
      ...previous,
      active: false,
      percent: 100,
    }));
  };

  const publishMaskState = () => {
    if (!enableMaskEditing) {
      return;
    }

    const maskSession = maskSessionRef.current;
    const payload: MaskToolbarStatePayload = {
      ready: maskSession.ready,
      visible: maskSession.visible,
      source: maskSession.source,
      message: maskSession.message,
      brushSize: maskSession.brushSize,
      dirty: maskSession.dirty,
      canUndo: maskSession.canUndo,
      canRedo: maskSession.canRedo,
      mode: maskSession.mode,
      brushShape: maskSession.brushShape,
    };

    PubSub.publish(MASK_STATE_TOPIC, payload);
  };

  const updateMaskState = (partial: Partial<MaskSessionState>) => {
    Object.assign(maskSessionRef.current, partial);
    if (enableMaskEditing) {
      setMaskBanner(maskSessionRef.current.message);
    }
    publishMaskState();
  };

  const setActiveMaskSegment = (
    segmentIndex: number,
    options: { message?: string } = {}
  ) => {
    const maskSession = maskSessionRef.current;

    if (!maskSession.segmentationId || !Number.isFinite(segmentIndex)) {
      return;
    }

    const nextSegmentIndex = Math.max(1, Math.round(segmentIndex));
    segmentation.segmentIndex.setActiveSegmentIndex(
      maskSession.segmentationId,
      nextSegmentIndex
    );
    renderingEngine?.render();

    if (options.message) {
      updateMaskState({
        message: options.message,
      });
    }
  };

  const getSegmentCenterWorld = (segmentIndex: number): Types.Point3 | null => {
    const maskSession = maskSessionRef.current;
    const segmentationVolume = cache.getVolume(maskSession.segmentationVolumeId);

    if (!segmentationVolume || !Number.isFinite(segmentIndex) || segmentIndex <= 0) {
      return null;
    }

    const scalarData = segmentationVolume.getScalarData() as Uint8Array;
    const dimensions = segmentationVolume.dimensions || [];
    const imageData = segmentationVolume.imageData;

    if (
      !scalarData ||
      !imageData?.indexToWorld ||
      dimensions.length < 3 ||
      !dimensions.every((value: number) => Number.isFinite(value) && value > 0)
    ) {
      return null;
    }

    const [dimX, dimY, dimZ] = dimensions as [number, number, number];
    const targetValue = Math.round(segmentIndex);
    const planeSize = dimX * dimY;
    let sumX = 0;
    let sumY = 0;
    let sumZ = 0;
    let voxelCount = 0;

    for (let flatIndex = 0; flatIndex < scalarData.length; flatIndex += 1) {
      if (scalarData[flatIndex] !== targetValue) {
        continue;
      }

      const z = Math.floor(flatIndex / planeSize);
      const xyIndex = flatIndex - z * planeSize;
      const y = Math.floor(xyIndex / dimX);
      const x = xyIndex - y * dimX;

      sumX += x;
      sumY += y;
      sumZ += z;
      voxelCount += 1;
    }

    if (!voxelCount) {
      return null;
    }

    return imageData.indexToWorld([
      sumX / voxelCount,
      sumY / voxelCount,
      sumZ / voxelCount,
    ]) as Types.Point3;
  };

  const syncSliceIndicatorsFromWorld = (worldPoint: Types.Point3) => {
    const referencedVolume = cache.getVolume(maskSessionRef.current.referencedVolumeId);
    const imageData = referencedVolume?.imageData;

    if (!imageData?.worldToIndex) {
      return;
    }

    const continuousIndex = imageData.worldToIndex(worldPoint) as Types.Point3;
    const [dimX, dimY, dimZ] = referencedVolume.dimensions;
    const indexX = clampIndex(continuousIndex[0], dimX);
    const indexY = clampIndex(continuousIndex[1], dimY);
    const indexZ = clampIndex(continuousIndex[2], dimZ);

    setPET_AXIAL_Index(indexZ + 1);
    setPET_CORONAL_Index(PET_CORONAL_Num - indexY + 1);
    setPET_SAGITTAL_Index(indexX + 1);
  };

  const focusMaskSegment = (
    segmentIndex: number,
    options: { message?: string; fallbackImageIndexes?: number[] } = {}
  ) => {
    const nextSegmentIndex = Math.max(1, Math.round(segmentIndex));

    setActiveMaskSegment(nextSegmentIndex, options.message ? { message: options.message } : {});

    const centerWorld = getSegmentCenterWorld(nextSegmentIndex);
    if (centerWorld) {
      let focusedViewport = false;
      viewportIds.forEach((viewportId, index) => {
        if (index === 3) {
          return;
        }

        const viewport = renderingEngine?.getViewport(viewportId) as Types.IVolumeViewport;
        if (!viewport) {
          return;
        }

        jumpViewportToWorld(viewport, centerWorld);
        focusedViewport = true;
      });

      if (focusedViewport) {
        syncSliceIndicatorsFromWorld(centerWorld);
        renderingEngine?.render();
        return true;
      }
    }

    if (options.fallbackImageIndexes?.length) {
      return jumpToImageIndexes(options.fallbackImageIndexes);
    }

    return false;
  };

  const jumpToImageIndexes = (imageIndexs: number[]) => {
    if (
      imageIndexs.length < 3 ||
      !imageIndexs.every((imageIndex) => Number.isFinite(imageIndex)) ||
      !renderingEngine
    ) {
      return false;
    }

    let jumped = false;
    viewportIds.forEach((viewportId, index) => {
      if (index === 3) {
        return;
      }

      const viewport = renderingEngine.getViewport(viewportId);
      if (!viewport?.element) {
        return;
      }

      jumpToSlice(viewport.element, {
        imageIndex:
          index === 1 ? PET_CORONAL_Num - imageIndexs[2 - index] : imageIndexs[2 - index],
      });
      jumped = true;

      switch (index) {
        case 0:
          setPET_AXIAL_Index(imageIndexs[2] + 1);
          break;
        case 1:
          setPET_CORONAL_Index(PET_CORONAL_Num - imageIndexs[1] + 1);
          break;
        case 2:
          setPET_SAGITTAL_Index(imageIndexs[0] + 1);
          break;
        default:
          break;
      }
    });

    return jumped;
  };

  const clearInitialLesionFocusTimer = () => {
    if (initialLesionFocusTimer.current) {
      clearTimeout(initialLesionFocusTimer.current);
      initialLesionFocusTimer.current = null;
    }
  };

  const focusInitialLesionFromUrl = () => {
    if (!enableMaskEditing || initialLesionFocusApplied.current) {
      return true;
    }

    const params = new URLSearchParams(window.location.search);
    const storedFocus = getStoredInitialLesionFocus();
    const lesionId = params.get("lesionId") || storedFocus.lesionId || "";
    const lesionLabelFromUrl = Number(params.get("lesionLabel"));
    const imageIndexsFromUrl = parseIndexList(params.get("imageIndexs"));
    const lesionLabel =
      Number.isFinite(lesionLabelFromUrl) && lesionLabelFromUrl > 0
        ? lesionLabelFromUrl
        : storedFocus.lesionLabel;
    const imageIndexs = imageIndexsFromUrl.length
      ? imageIndexsFromUrl
      : storedFocus.imageIndexs;
    const hasInitialFocusTarget =
      (Number.isFinite(lesionLabel) && lesionLabel > 0) || imageIndexs.length >= 3;

    if (!hasInitialFocusTarget) {
      initialLesionFocusApplied.current = true;
      return true;
    }

    activeLesionEditTargetRef.current = {
      lesionId,
      lesionLabel: Number.isFinite(lesionLabel) && lesionLabel > 0 ? String(lesionLabel) : "",
    };

    let focused = false;
    if (Number.isFinite(lesionLabel) && lesionLabel > 0) {
      focused = focusMaskSegment(lesionLabel, {
        message: `当前编辑病灶ID ${lesionId || lesionLabel}`,
        fallbackImageIndexes: imageIndexs,
      });
    } else if (imageIndexs.length) {
      focused = jumpToImageIndexes(imageIndexs);
    }

    if (focused) {
      clearInitialLesionFocusTimer();
      initialLesionFocusApplied.current = true;
      window.sessionStorage.removeItem(LESION_EDIT_FOCUS_STORAGE_KEY);
      const focusLoadToken = loadTokenRef.current;
      for (let replayIndex = 1; replayIndex <= INITIAL_LESION_FOCUS_SETTLE_REPLAYS; replayIndex += 1) {
        window.setTimeout(() => {
          if (loadTokenRef.current === focusLoadToken && enableMaskEditing) {
            if (Number.isFinite(lesionLabel) && lesionLabel > 0) {
              focusMaskSegment(lesionLabel, {
                message: `当前编辑病灶ID ${lesionId || lesionLabel}`,
                fallbackImageIndexes: imageIndexs,
              });
              return;
            }

            jumpToImageIndexes(imageIndexs);
          }
        }, replayIndex * INITIAL_LESION_FOCUS_RETRY_MS);
      }
      return true;
    }

    if (initialLesionFocusAttempts.current < INITIAL_LESION_FOCUS_MAX_ATTEMPTS) {
      initialLesionFocusAttempts.current += 1;
      clearInitialLesionFocusTimer();
      initialLesionFocusTimer.current = setTimeout(
        focusInitialLesionFromUrl,
        INITIAL_LESION_FOCUS_RETRY_MS
      );
    }

    return false;
  };

  const setViewportWindowLevel = (
    viewportId: string,
    voiRange?: Types.VOIRange | null
  ) => {
    if (!voiRange) {
      return;
    }

    const { windowWidth, windowCenter } = windowLevel.toWindowLevel(
      voiRange.lower,
      voiRange.upper
    );

    if (!Number.isFinite(windowWidth) || !Number.isFinite(windowCenter)) {
      return;
    }

    setWindowLevels((previous) => {
      const current = previous[viewportId];

      if (
        current &&
        Math.round(current.width) === Math.round(windowWidth) &&
        Math.round(current.center) === Math.round(windowCenter)
      ) {
        return previous;
      }

      return {
        ...previous,
        [viewportId]: {
          width: windowWidth,
          center: windowCenter,
        },
      };
    });
  };

  const refreshViewportWindowLevel = (viewportId: string) => {
    const viewport = renderingEngine?.getViewport(
      viewportId
    ) as Types.IVolumeViewport;

    setViewportWindowLevel(viewportId, viewport?.getProperties?.().voiRange);
  };

  const getSegmentationVolume = () =>
    cache.getVolume(maskSessionRef.current.segmentationVolumeId);

  const setMaskActorsVisibility = (visible: boolean) => {
    const maskSession = maskSessionRef.current;

    if (!renderingEngine || !maskSession.segmentationRepresentationUID) {
      return;
    }

    viewportIds.forEach((viewportId) => {
      const viewport = renderingEngine.getViewport(viewportId) as Types.IVolumeViewport;
      const actorEntry = viewport?.getActor?.(
        maskSession.segmentationRepresentationUID
      );

      actorEntry?.actor?.setVisibility?.(visible);
      viewport?.render?.();
    });
  };

  const triggerSegmentationRender = () => {
    const maskSession = maskSessionRef.current;

    if (!maskSession.segmentationId) {
      return;
    }

    segmentation.triggerSegmentationEvents.triggerSegmentationDataModified(
      maskSession.segmentationId
    );
    renderingEngine?.render();
    window.setTimeout(() => setMaskActorsVisibility(maskSession.visible), 0);
  };

  const applyScalarDataToSegmentation = (
    nextData: Uint8Array,
    options: { recordHistory?: boolean } = {}
  ) => {
    const segmentationVolume = getSegmentationVolume();

    if (!segmentationVolume) {
      return;
    }

    const scalarData = segmentationVolume.getScalarData() as Uint8Array;
    scalarData.set(nextData);
    const shouldRecordHistory = options.recordHistory !== false;
    maskSessionRef.current.suppressHistory = !shouldRecordHistory;

    try {
      triggerSegmentationRender();
    } finally {
      maskSessionRef.current.suppressHistory = false;
    }
  };

  const reloadSegmentationFromDisk = async (payload: MaskReloadPayload = {}) => {
    const maskSession = maskSessionRef.current;
    const segmentationVolume = getSegmentationVolume();
    const referencedVolume = cache.getVolume(maskSession.referencedVolumeId);

    if (!enableMaskEditing) {
      return;
    }

    if (
      !effectiveOutputPath ||
      !maskSession.ready ||
      !segmentationVolume ||
      !referencedVolume
    ) {
      pendingMaskReloadSource.current = payload.source;
      return;
    }

    try {
      const response = await loadSegmentation(
        seriesId,
        effectiveOutputPath,
        payload.source
      );

      if (
        !response.success ||
        !response.exists ||
        !response.scalarDataBase64 ||
        !response.dimensions
      ) {
        updateMaskState({
          message: "未找到可加载的算法Mask",
        });
        return;
      }

      const loadedMask = base64ToUint8Array(response.scalarDataBase64);
      const expectedLength =
        response.dimensions[0] * response.dimensions[1] * response.dimensions[2];

      if (
        expectedLength !== (referencedVolume.getScalarData() as Uint8Array).length ||
        response.dimensions[0] !== referencedVolume.dimensions[0] ||
        response.dimensions[1] !== referencedVolume.dimensions[1] ||
        response.dimensions[2] !== referencedVolume.dimensions[2]
      ) {
        updateMaskState({
          message: "Mask尺寸与当前PET/CT不一致，无法刷新显示",
        });
        return;
      }

      applyScalarDataToSegmentation(loadedMask, { recordHistory: false });
      updateMaskState({
        source: response.source === "doctor" ? "doctor" : "algorithm",
        dirty: false,
        canUndo: false,
        canRedo: false,
        undoStack: [],
        redoStack: [],
        committedSnapshot: cloneScalarData(loadedMask),
        savedSnapshot: cloneScalarData(loadedMask),
        message:
          response.source === "doctor"
            ? "已刷新医生修订版Mask"
            : "已刷新算法初始Mask",
      });
      pendingMaskReloadSource.current = undefined;
    } catch (error) {
      updateMaskState({
        message: "Mask刷新失败",
      });
    }
  };

  const clearPendingHistoryTimer = () => {
    const maskSession = maskSessionRef.current;

    if (maskSession.historyTimer) {
      clearTimeout(maskSession.historyTimer);
      maskSession.historyTimer = null;
    }

    maskSession.pendingHistory = false;
  };

  const finalizeHistoryStep = () => {
    const segmentationVolume = getSegmentationVolume();

    if (!segmentationVolume) {
      return;
    }

    const currentSnapshot = cloneScalarData(
      segmentationVolume.getScalarData() as Uint8Array
    );

    updateMaskState({
      committedSnapshot: currentSnapshot,
      pendingHistory: false,
      dirty: true,
      canUndo: maskSessionRef.current.undoStack.length > 0,
      canRedo: maskSessionRef.current.savedSnapshot !== null,
      message:
        maskSessionRef.current.source === "none"
          ? "Blank mask edited"
          : "Mask updated and not saved",
    });
  };

  const queueHistorySnapshot = () => {
    const maskSession = maskSessionRef.current;

    if (maskSession.suppressHistory) {
      return;
    }

    if (!maskSession.committedSnapshot) {
      return;
    }

    if (!maskSession.pendingHistory) {
      maskSession.undoStack.push(maskSession.committedSnapshot);
      maskSession.redoStack = [];
      maskSession.pendingHistory = true;
      updateMaskState({
        canUndo: true,
        canRedo: false,
      });
    }

    if (maskSession.historyTimer) {
      clearTimeout(maskSession.historyTimer);
    }

    maskSession.historyTimer = setTimeout(finalizeHistoryStep, 500);
  };

  const initializeSegmentation = async () => {
    if (!enableMaskEditing) {
      return;
    }

    setMaskLoadingProgress(22, "Initializing Mask...");
    if (!volumeIds.length) {
      updateMaskState({
        ready: false,
        source: "none",
        message: "当前模式暂不支持Mask",
      });
      finishMaskLoadingProgress();
      return;
    }

    const referencedVolume = cache.getVolume(volumeIds[0]);
    setMaskLoadingProgress(32, "Reading reference volume...");

    if (!referencedVolume) {
      updateMaskState({
        ready: false,
        source: "error",
        message: "当前病例无可编辑Mask",
      });
      finishMaskLoadingProgress();
      return;
    }

    const scalarLength = (referencedVolume.getScalarData() as Uint8Array).length;
    const blankMask = new Uint8Array(scalarLength);
    let scalarData = blankMask;
    let source: MaskToolbarStatePayload["source"] = "empty";
    let message = "未找到算法Mask，当前使用空白Mask";

    if (effectiveOutputPath) {
      try {
        setMaskLoadingProgress(45, "Loading saved segmentation...");
        const response = await loadSegmentation(seriesId, effectiveOutputPath);
        setMaskLoadingProgress(62, "Preparing segmentation data...");

        if (
          response.success &&
          response.exists &&
          response.scalarDataBase64 &&
          response.dimensions
        ) {
          const loadedMask = base64ToUint8Array(response.scalarDataBase64);
          setMaskLoadingProgress(74, "Checking mask dimensions...");
          const expectedLength =
            response.dimensions[0] * response.dimensions[1] * response.dimensions[2];

          if (
            expectedLength === scalarLength &&
            response.dimensions[0] === referencedVolume.dimensions[0] &&
            response.dimensions[1] === referencedVolume.dimensions[1] &&
            response.dimensions[2] === referencedVolume.dimensions[2]
          ) {
            scalarData = loadedMask;
            source = response.source === "doctor" ? "doctor" : "algorithm";
            if (response.isEmptyMask) {
              message =
                source === "doctor"
                  ? "已加载医生确认阴性的空白Mask"
                  : "已加载算法空白Mask";
            } else {
              message =
                source === "doctor"
                  ? "已加载医生修订版Mask"
                  : "已加载算法初始Mask";
            }
          } else {
            message = "Mask尺寸与当前PET/CT不一致，已回退为空白Mask";
          }
        } else if (!response.success) {
          source = "error";
          message = response.message || "Mask failed to load";
        }
      } catch (error) {
        source = "error";
        message = "Mask加载失败，当前使用空白Mask";
      }
    } else {
      message = "当前病例缺少outputPath，无法加载算法Mask";
    }

    setMaskLoadingProgress(88, "Creating editable overlay...");
    const runtimeSuffix = `${seriesId}:${Date.now()}`;
    const segmentationVolumeId = `${SEGMENTATION_VOLUME_PREFIX}:${runtimeSuffix}`;
    const segmentationId = segmentationVolumeId;
    const segmentationVolume = await volumeLoader.createLocalVolume(
      {
        metadata: referencedVolume.metadata,
        dimensions: referencedVolume.dimensions,
        spacing: referencedVolume.spacing,
        origin: referencedVolume.origin,
        direction: referencedVolume.direction,
        scalarData,
      },
      segmentationVolumeId
    );

    segmentation.addSegmentations([
      {
        segmentationId,
        representation: {
          type: SegmentationRepresentations.Labelmap,
          data: {
            volumeId: segmentationVolumeId,
            referencedVolumeId: volumeIds[0],
          },
        },
      },
    ]);

    const [segmentationRepresentationUID] =
      await segmentation.addSegmentationRepresentations(VolumeToolGroup.id, [
        {
          segmentationId,
          type: SegmentationRepresentations.Labelmap,
        },
      ]);

    segmentation.activeSegmentation.setActiveSegmentationRepresentation(
      VolumeToolGroup.id,
      segmentationRepresentationUID
    );
    segmentation.segmentIndex.setActiveSegmentIndex(segmentationId, 1);
    setBrushSizeForToolGroup(VolumeToolGroup.id, DEFAULT_MASK_BRUSH_SIZE);
    setMaskLoadingProgress(100, "Mask ready");

    updateMaskState({
      segmentationId,
      segmentationRepresentationUID,
      segmentationVolumeId,
      referencedVolumeId: volumeIds[0],
      ready: true,
      visible: true,
      source,
      message,
      brushSize: DEFAULT_MASK_BRUSH_SIZE,
      dirty: false,
      canUndo: false,
      canRedo: false,
      undoStack: [],
      redoStack: [],
      committedSnapshot: cloneScalarData(
        segmentationVolume.getScalarData() as Uint8Array
      ),
      savedSnapshot: cloneScalarData(
        segmentationVolume.getScalarData() as Uint8Array
      ),
      mode: "none",
    });
    window.setTimeout(() => {
      focusInitialLesionFromUrl();
      if (pendingMaskReloadSource.current) {
        reloadSegmentationFromDisk({ source: pendingMaskReloadSource.current });
      }
    }, 0);
    window.setTimeout(finishMaskLoadingProgress, 350);
  };

  const getBrushStrategy = (
    mode: "brush" | "erase",
    shape = maskSessionRef.current.brushShape
  ) => {
    if (shape === "square") {
      return mode === "erase"
        ? SQUARE_BRUSH_ERASE_STRATEGY
        : SQUARE_BRUSH_FILL_STRATEGY;
    }

    return mode === "erase" ? ERASE_STRATEGY : BRUSH_STRATEGY;
  };

  const applyBrushShape = (shape: BrushShape) => {
    const brushTool = (VolumeToolGroup as any).getToolInstance?.(
      BrushTool.toolName
    );

    if (brushTool) {
      brushTool.brushShape = shape;
      brushTool.configuration.brushShape = shape;
      brushTool.disableCursor?.();
    }

    renderingEngine?.render();
  };

  const setMaskMode = (mode: "none" | "brush" | "erase") => {
    const maskSession = maskSessionRef.current;

    if (!maskSession.ready) {
      return;
    }

    if (mode === "none") {
      setToolPassiveFun(VolumeToolGroup);
      updateMaskState({ mode: "none", message: maskSession.message });
      return;
    }

    setToolPassiveFun(VolumeToolGroup);
    applyBrushShape(maskSession.brushShape);
    (VolumeToolGroup as any).setActiveStrategy(
      BrushTool.toolName,
      getBrushStrategy(mode)
    );
    VolumeToolGroup.setToolActive(BrushTool.toolName, {
      bindings: [{ mouseButton: MouseBindings.Primary }],
    });
    applyBrushShape(maskSession.brushShape);
    (VolumeToolGroup as any).setActiveStrategy(
      BrushTool.toolName,
      getBrushStrategy(mode)
    );
    updateMaskState({
      mode,
      message: mode === "erase" ? "Erase mode enabled" : "Brush mode enabled",
    });
  };

  const setBrushShape = (shape: BrushShape) => {
    const maskSession = maskSessionRef.current;

    if (!maskSession.ready) {
      return;
    }

    applyBrushShape(shape);

    (VolumeToolGroup as any).setActiveStrategy(
      BrushTool.toolName,
      getBrushStrategy(
        maskSession.mode === "erase" ? "erase" : "brush",
        shape
      )
    );

    updateMaskState({
      brushShape: shape,
      message: shape === "square" ? "Square brush enabled" : "Circle brush enabled",
    });
  };

  const clearBrushCursor = () => {
    const brushTool = (VolumeToolGroup as any).getToolInstance?.(
      BrushTool.toolName
    );

    brushTool?.disableCursor?.();
    renderingEngine?.render();
  };

  const toggleMaskVisibility = () => {
    const maskSession = maskSessionRef.current;

    if (
      !maskSession.ready ||
      !maskSession.segmentationRepresentationUID ||
      !getSegmentationVolume()
    ) {
      return;
    }

    const nextVisibility = !maskSession.visible;
    setMaskActorsVisibility(nextVisibility);
    renderingEngine?.render();
    updateMaskState({
      visible: nextVisibility,
      message: nextVisibility ? "Mask visible" : "Mask hidden",
    });

    if (nextVisibility) {
      window.setTimeout(() => {
        setMaskActorsVisibility(true);
        renderingEngine?.render();
      }, 0);
    }
  };

  const changeBrushSize = (delta: number) => {
    const maskSession = maskSessionRef.current;
    const nextSize = Math.max(1, maskSession.brushSize + delta);

    setBrushSizeForToolGroup(VolumeToolGroup.id, nextSize);
    updateMaskState({
      brushSize: nextSize,
      message: `Brush radius set to ${nextSize}`,
    });
  };

  const undoMaskEdit = () => {
    const maskSession = maskSessionRef.current;

    if (!maskSession.undoStack.length) {
      return;
    }

    clearPendingHistoryTimer();

    const segmentationVolume = getSegmentationVolume();

    if (!segmentationVolume) {
      return;
    }

    const currentSnapshot = cloneScalarData(
      segmentationVolume.getScalarData() as Uint8Array
    );
    const previousSnapshot = maskSession.undoStack.pop();

    if (!previousSnapshot) {
      return;
    }

    maskSession.redoStack.push(currentSnapshot);
    applyScalarDataToSegmentation(previousSnapshot, { recordHistory: false });
    updateMaskState({
      committedSnapshot: cloneScalarData(previousSnapshot),
      canUndo: maskSession.undoStack.length > 0,
      canRedo: true,
      dirty: true,
      message: "Undid the previous mask edit",
    });
  };

  const redoMaskEdit = () => {
    const maskSession = maskSessionRef.current;

    if (!maskSession.savedSnapshot) {
      return;
    }

    clearPendingHistoryTimer();
    applyScalarDataToSegmentation(maskSession.savedSnapshot, {
      recordHistory: false,
    });
    updateMaskState({
      committedSnapshot: cloneScalarData(maskSession.savedSnapshot),
      undoStack: [],
      redoStack: [],
      canUndo: false,
      canRedo: false,
      dirty: false,
      message: "已恢复到上一次保存的Mask",
    });
  };

  const getCurrentMaskPayload = (): SegmentationSavePayload | null => {
    const maskSession = maskSessionRef.current;
    const segmentationVolume = getSegmentationVolume();
    const referencedVolume = cache.getVolume(maskSession.referencedVolumeId);

    if (!maskSession.ready || !segmentationVolume || !referencedVolume) {
      return null;
    }

    const scalarData = segmentationVolume.getScalarData() as Uint8Array;

    return {
      outputPath: effectiveOutputPath,
      dimensions: [
        referencedVolume.dimensions[0],
        referencedVolume.dimensions[1],
        referencedVolume.dimensions[2],
      ],
      spacing: [
        referencedVolume.spacing[0],
        referencedVolume.spacing[1],
        referencedVolume.spacing[2],
      ],
      origin: [
        referencedVolume.origin[0],
        referencedVolume.origin[1],
        referencedVolume.origin[2],
      ],
      direction: Array.from(referencedVolume.direction),
      scalarDataBase64: uint8ArrayToBase64(scalarData),
    };
  };

  const formatMaskNumber = (value: number, digits = 1) =>
    Number.isFinite(value) ? value.toFixed(digits) : "";

  const formatStatisticNumber = (value: number, digits = 3) =>
    Number.isFinite(value) ? value.toFixed(digits) : "";

  const getCurrentMaskStats = (): LesionMaskStat[] => {
    const maskSession = maskSessionRef.current;
    const segmentationVolume = getSegmentationVolume();
    const referencedVolume = cache.getVolume(maskSession.referencedVolumeId);
    const petVolume = cache.getVolume(volumeIds[0]);
    const ctVolume = cache.getVolume(volumeIds[ctVolumeIndex]);
    const imageData = referencedVolume?.imageData;
    const ctImageData = ctVolume?.imageData;

    if (!maskSession.ready || !segmentationVolume || !referencedVolume) {
      return [];
    }

    const scalarData = segmentationVolume.getScalarData() as Uint8Array;
    const dimensions = referencedVolume.dimensions || [];
    const spacing = referencedVolume.spacing || [];

    if (
      !scalarData ||
      dimensions.length < 3 ||
      spacing.length < 3 ||
      !dimensions.every((value: number) => Number.isFinite(value) && value > 0)
    ) {
      return [];
    }

    const [dimX, dimY] = dimensions as [number, number, number];
    const planeSize = dimX * dimY;
    const voxelVolumeMl =
      Math.abs(Number(spacing[0]) * Number(spacing[1]) * Number(spacing[2])) / 1000;
    const petScalarData = petVolume?.getScalarData?.() as ArrayLike<number> | undefined;
    const ctScalarData = ctVolume?.getScalarData?.() as ArrayLike<number> | undefined;
    const canUsePetStats = !!petScalarData && petScalarData.length === scalarData.length;
    const canUseCtSameGridStats = !!ctScalarData && ctScalarData.length === scalarData.length;
    const ctDimensions = ctVolume?.dimensions || [];
    const canUseCtWorldStats =
      !!ctScalarData &&
      !!ctImageData?.worldToIndex &&
      !!imageData?.indexToWorld &&
      ctDimensions.length >= 3 &&
      ctDimensions.every((value: number) => Number.isFinite(value) && value > 0);
    const sampleCtValue = (x: number, y: number, z: number, flatIndex: number) => {
      if (!ctScalarData) {
        return Number.NaN;
      }

      if (canUseCtSameGridStats) {
        return Number(ctScalarData[flatIndex]);
      }

      if (!canUseCtWorldStats) {
        return Number.NaN;
      }

      const worldPoint = imageData.indexToWorld([x, y, z]) as Types.Point3;
      const ctIndex = ctImageData.worldToIndex(worldPoint) as Types.Point3;
      const ctX = Math.round(ctIndex[0]);
      const ctY = Math.round(ctIndex[1]);
      const ctZ = Math.round(ctIndex[2]);
      const [ctDimX, ctDimY, ctDimZ] = ctDimensions as [number, number, number];

      if (
        ctX < 0 ||
        ctY < 0 ||
        ctZ < 0 ||
        ctX >= ctDimX ||
        ctY >= ctDimY ||
        ctZ >= ctDimZ
      ) {
        return Number.NaN;
      }

      return Number(ctScalarData[ctZ * ctDimX * ctDimY + ctY * ctDimX + ctX]);
    };
    const stats = new Map<
      number,
      {
        count: number;
        sumX: number;
        sumY: number;
        sumZ: number;
        minX: number;
        minY: number;
        minZ: number;
        maxX: number;
        maxY: number;
        maxZ: number;
        petCount: number;
        petSum: number;
        petSumSquares: number;
        petMax: number;
        ctCount: number;
        ctSum: number;
        ctSumSquares: number;
        ctMin: number;
        ctMax: number;
      }
    >();

    for (let flatIndex = 0; flatIndex < scalarData.length; flatIndex += 1) {
      const label = scalarData[flatIndex];
      if (!label) {
        continue;
      }

      const z = Math.floor(flatIndex / planeSize);
      const xyIndex = flatIndex - z * planeSize;
      const y = Math.floor(xyIndex / dimX);
      const x = xyIndex - y * dimX;
      const current =
        stats.get(label) ||
        {
          count: 0,
          sumX: 0,
          sumY: 0,
          sumZ: 0,
          minX: x,
          minY: y,
          minZ: z,
          maxX: x,
          maxY: y,
          maxZ: z,
          petCount: 0,
          petSum: 0,
          petSumSquares: 0,
          petMax: Number.NEGATIVE_INFINITY,
          ctCount: 0,
          ctSum: 0,
          ctSumSquares: 0,
          ctMin: Number.POSITIVE_INFINITY,
          ctMax: Number.NEGATIVE_INFINITY,
        };

      current.count += 1;
      current.sumX += x;
      current.sumY += y;
      current.sumZ += z;
      current.minX = Math.min(current.minX, x);
      current.minY = Math.min(current.minY, y);
      current.minZ = Math.min(current.minZ, z);
      current.maxX = Math.max(current.maxX, x);
      current.maxY = Math.max(current.maxY, y);
      current.maxZ = Math.max(current.maxZ, z);

      if (canUsePetStats) {
        const petValue = Number(petScalarData[flatIndex]);
        if (Number.isFinite(petValue)) {
          current.petCount += 1;
          current.petSum += petValue;
          current.petSumSquares += petValue * petValue;
          current.petMax = Math.max(current.petMax, petValue);
        }
      }

      if (canUseCtSameGridStats || canUseCtWorldStats) {
        const ctValue = sampleCtValue(x, y, z, flatIndex);
        if (Number.isFinite(ctValue)) {
          current.ctCount += 1;
          current.ctSum += ctValue;
          current.ctSumSquares += ctValue * ctValue;
          current.ctMin = Math.min(current.ctMin, ctValue);
          current.ctMax = Math.max(current.ctMax, ctValue);
        }
      }

      stats.set(label, current);
    }

    return Array.from(stats.entries())
      .sort(([leftLabel], [rightLabel]) => leftLabel - rightLabel)
      .map(([label, stat]) => {
        const centerIndex: Types.Point3 = [
          stat.sumX / stat.count,
          stat.sumY / stat.count,
          stat.sumZ / stat.count,
        ];
        const centerWorld = imageData?.indexToWorld
          ? (imageData.indexToWorld(centerIndex) as Types.Point3)
          : null;
        const range = [
          (stat.maxX - stat.minX + 1) * Number(spacing[0]),
          (stat.maxY - stat.minY + 1) * Number(spacing[1]),
          (stat.maxZ - stat.minZ + 1) * Number(spacing[2]),
        ];
        const petMean = stat.petCount ? stat.petSum / stat.petCount : Number.NaN;
        const petVariance = stat.petCount
          ? Math.max(stat.petSumSquares / stat.petCount - petMean * petMean, 0)
          : Number.NaN;
        const ctMean = stat.ctCount ? stat.ctSum / stat.ctCount : Number.NaN;
        const ctVariance = stat.ctCount
          ? Math.max(stat.ctSumSquares / stat.ctCount - ctMean * ctMean, 0)
          : Number.NaN;

        return {
          lesionLabel: String(label),
          centerIndex: `[${centerIndex.map((value) => formatMaskNumber(value)).join(", ")}]`,
          centerPosition: centerWorld
            ? `[${centerWorld.map((value) => `${formatMaskNumber(value)}mm`).join(", ")}]`
            : "",
          range: `[${range.map((value) => `${formatMaskNumber(value)}mm`).join(", ")}]`,
          volume: `${formatMaskNumber(stat.count * voxelVolumeMl, 3)}ml`,
          suvMax: stat.petCount ? formatStatisticNumber(stat.petMax) : "",
          suvMean: stat.petCount ? formatStatisticNumber(petMean) : "",
          suvStd: stat.petCount ? formatStatisticNumber(Math.sqrt(petVariance)) : "",
          ctCentroid: stat.ctCount ? formatStatisticNumber(ctMean) : "",
          ctMin: stat.ctCount ? formatStatisticNumber(stat.ctMin) : "",
          ctMax: stat.ctCount ? formatStatisticNumber(stat.ctMax) : "",
          ctMean: stat.ctCount ? formatStatisticNumber(ctMean) : "",
          ctStd: stat.ctCount ? formatStatisticNumber(Math.sqrt(ctVariance)) : "",
          debugInfo: `voxel_count=${stat.count}|source=doctor_mask`,
          voxelCount: stat.count,
        };
      });
  };

  const persistCurrentMask = async (reason: "save" | "export") => {
    const payload = getCurrentMaskPayload();
    const maskStats = getCurrentMaskStats();
    let exportParentDir = "";

    if (!payload || !effectiveOutputPath) {
      updateMaskState({
        message:
          reason === "export"
            ? "Missing information required to export the result"
            : "Missing information required to save the mask",
      });
      return;
    }

    if (reason === "export") {
      if (!ipcRenderer) {
        updateMaskState({ message: "当前环境不支持选择导出目录" });
        return;
      }

      exportParentDir = await ipcRenderer.invoke("select-result-export-directory");
      if (!exportParentDir) {
        updateMaskState({ message: "已取消导出结果" });
        return;
      }
    }

    try {
      const result = await saveSegmentation(seriesId, payload);
      const scalarData = base64ToUint8Array(payload.scalarDataBase64);
      const message =
        reason === "export"
          ? "医生结果已同步，正在导出结果文件夹"
          : scalarData.some((value) => value > 0)
            ? `Mask saved as doctor revision: ${result.path || "doctor_mask.nii.gz"}`
            : `Saved a blank mask: ${result.path || "doctor_mask.nii.gz"}`;
      updateMaskState({
        dirty: false,
        source: "doctor",
        committedSnapshot: cloneScalarData(scalarData),
        savedSnapshot: cloneScalarData(scalarData),
        undoStack: [],
        redoStack: [],
        canUndo: false,
        canRedo: false,
        message,
      });
      PubSub.publish(MASK_PERSISTED_TOPIC, {
        path: result.path || "",
        outputPath: effectiveOutputPath,
        reason,
        maskStats,
        exportParentDir,
        lesionTarget: activeLesionEditTargetRef.current,
      });
    } catch (error) {
      updateMaskState({
        message: reason === "export" ? "Result export failed" : "Mask save failed",
      });
    }
  };

  useEffect(() => {
    const loadToken = loadTokenRef.current + 1;
    loadTokenRef.current = loadToken;
    volumeLoaded.current = false;
    initialLesionFocusApplied.current = false;
    initialLesionFocusAttempts.current = 0;
    clearInitialLesionFocusTimer();
    updateMaskState(createInitialMaskSessionState());
    setMaskLoadingProgress(1, "Loading image data...");
    const brushCursorHandlers: Array<{
      element: Element;
      enter: EventListener;
      leave: EventListener;
    }> = [];
    const voiModifiedHandlers: Array<{
      element: Element;
      handler: EventListener;
    }> = [];
    let cameraModifiedHandlers: Array<{
      element: Element;
      handler: EventListener;
    }> = [];
    const attachBrushCursorHandlers = () => {
      if (!elements || !elements.length || brushCursorHandlers.length) {
        return;
      }

      Object.values(elements).forEach((element) => {
        const enter = () => clearBrushCursor();
        const leave = () => clearBrushCursor();

        element.addEventListener("pointerenter", enter);
        element.addEventListener("pointerleave", leave);
        brushCursorHandlers.push({ element, enter, leave });
      });
    };
    const attachVoiModifiedHandlers = () => {
      if (!elements || !elements.length || voiModifiedHandlers.length) {
        return;
      }

      viewportIds.forEach((viewportId, index) => {
        const element = elements[index];

        if (!element) {
          return;
        }

        const handler = (event: Event) => {
          const voiModifiedEvent = event as CustomEvent<{
            range?: Types.VOIRange;
          }>;

          setViewportWindowLevel(viewportId, voiModifiedEvent.detail?.range);
        };

        element.addEventListener(VOI_MODIFIED, handler);
        voiModifiedHandlers.push({ element, handler });
      });
    };

    volumes = initAndGetImageIds(
      renderingEngineId,
      inputPath,
      effectiveOutputPath,
      volumeIds,
      pflag,
      selectedSeries
    );
    volumes.then(async (value) => {
      if (loadToken !== loadTokenRef.current) {
        return;
      }

      setMaskLoadingProgress(8, "Preparing viewports...");
      await new Promise((resolve) => window.requestAnimationFrame(resolve));
      if (loadToken !== loadTokenRef.current) {
        return;
      }

      await createViewportAndRender(
        elements,
        renderingEngineId,
        renderingEngine,
        viewportIds,
        volumeIds,
        value,
        pflag,
        selectedSeries
      );
      if (loadToken !== loadTokenRef.current) {
        return;
      }

      setMaskLoadingProgress(18, "Rendering image volumes...");
      attachBrushCursorHandlers();
      attachVoiModifiedHandlers();
      viewportIds.forEach(refreshViewportWindowLevel);
      cameraModifiedHandlers = wheelEventListener(
        viewportIds,
        setPET_AXIAL_Index,
        setPET_CORONAL_Index,
        setPET_SAGITTAL_Index,
        setPET_CT_Index
      );
      volumeLoaded.current = true;
      const viewport_PET = renderingEngine.getViewport(
        viewportIds[0]
      ) as Types.IVolumeViewport;
      const imageData = viewport_PET.getImageData(volumeIds[0]);
      if (!imageData) {
        throw new Error("Volume image data is not ready");
      }

      const dimensions = imageData.dimensions;
      PET_SAGITTAL_Num = dimensions[1];
      PET_CORONAL_Num = dimensions[0];
      setPET_AXIAL_Index(
        getImageSliceDataForVolumeViewport(viewport_PET).imageIndex + 1
      );
      setPET_SAGITTAL_Index(Math.ceil(PET_SAGITTAL_Num / 2));
      setPET_CORONAL_Index(Math.ceil(PET_CORONAL_Num / 2));
      setPET_CT_Index(
        getImageSliceDataForVolumeViewport(viewport_PET).imageIndex + 1
      );
      if (enableMaskEditing) {
        await initializeSegmentation();
      } else {
        finishMaskLoadingProgress();
      }
    }).catch((error) => {
      if (loadToken !== loadTokenRef.current) {
        return;
      }

      console.error("Failed to load image data:", error);
      volumeLoaded.current = false;
      if (enableMaskEditing) {
        updateMaskState({
          ready: false,
          source: "error",
          message: "影像数据加载失败，请检查导入序列",
        });
      }
      finishMaskLoadingProgress();
      setMaskBanner("影像数据加载失败，请检查导入序列");
    });
    const jumpToken = PubSub.subscribe("imgJumpByIndex", (msg, data) => {
      jumpToImageIndexes(data as number[]);
    });
    const activeSegmentToken = PubSub.subscribe(
      MASK_ACTIVE_SEGMENT_TOPIC,
      (_, segmentIndex) => {
        setActiveMaskSegment(Number(segmentIndex), {
          message: `当前病灶标签 ${segmentIndex}`,
        });
      }
    );
    const focusSegmentToken = PubSub.subscribe(
      MASK_FOCUS_SEGMENT_TOPIC,
      (_, segmentIndex) => {
        focusMaskSegment(Number(segmentIndex), {
          message: `当前病灶标签 ${segmentIndex}`,
        });
      }
    );
    const lesionOpenToken = PubSub.subscribe("lesionEdit:open", (_, lesion: any) => {
      const lesionLabel = Number(lesion?.lesionLabel);
      const imageIndexs = parseIndexList(lesion?.imageIndexs || "");
      activeLesionEditTargetRef.current = {
        lesionId: lesion?.id ? String(lesion.id) : "",
        lesionLabel: Number.isFinite(lesionLabel) && lesionLabel > 0 ? String(lesionLabel) : "",
      };

      if (Number.isFinite(lesionLabel) && lesionLabel > 0) {
        focusMaskSegment(lesionLabel, {
          message: `当前病灶标签 ${lesionLabel}`,
          fallbackImageIndexes: imageIndexs,
        });
      } else if (imageIndexs.length) {
        jumpToImageIndexes(imageIndexs);
      }
    });
    const modeToken = PubSub.subscribe(MASK_SET_MODE_TOPIC, (_, mode) => {
      setMaskMode(mode as "none" | "brush" | "erase");
    });
    const visibilityToken = PubSub.subscribe(MASK_TOGGLE_VISIBILITY_TOPIC, () => {
      toggleMaskVisibility();
    });
    const brushSizeToken = PubSub.subscribe(MASK_BRUSH_SIZE_TOPIC, (_, delta) => {
      changeBrushSize(delta as number);
    });
    const reloadToken = PubSub.subscribe(MASK_RELOAD_TOPIC, (_, payload) => {
      reloadSegmentationFromDisk((payload || {}) as MaskReloadPayload);
    });
    const brushShapeToken = PubSub.subscribe(MASK_BRUSH_SHAPE_TOPIC, (_, shape) => {
      setBrushShape(shape as BrushShape);
    });
    const undoToken = PubSub.subscribe(MASK_UNDO_TOPIC, () => {
      undoMaskEdit();
    });
    const redoToken = PubSub.subscribe(MASK_REDO_TOPIC, () => {
      redoMaskEdit();
    });
    const saveToken = PubSub.subscribe(MASK_SAVE_TOPIC, () => {
      persistCurrentMask("save");
    });
    const exportToken = PubSub.subscribe(MASK_EXPORT_TOPIC, () => {
      persistCurrentMask("export");
    });
    const segmentationModifiedHandler = (event) => {
      if (
        event.detail?.segmentationId === maskSessionRef.current.segmentationId
      ) {
        queueHistorySnapshot();
      }
    };
    eventTarget.addEventListener(
      CsToolsEvents.SEGMENTATION_DATA_MODIFIED,
      segmentationModifiedHandler
    );

    return () => {
      if (loadToken === loadTokenRef.current) {
        loadTokenRef.current += 1;
      }

      eventTarget.removeEventListener(
        CsToolsEvents.SEGMENTATION_DATA_MODIFIED,
        segmentationModifiedHandler
      );
      PubSub.unsubscribe(jumpToken);
      PubSub.unsubscribe(activeSegmentToken);
      PubSub.unsubscribe(focusSegmentToken);
      PubSub.unsubscribe(lesionOpenToken);
      PubSub.unsubscribe(modeToken);
      PubSub.unsubscribe(visibilityToken);
      PubSub.unsubscribe(brushSizeToken);
      PubSub.unsubscribe(reloadToken);
      PubSub.unsubscribe(brushShapeToken);
      PubSub.unsubscribe(undoToken);
      PubSub.unsubscribe(redoToken);
      PubSub.unsubscribe(saveToken);
      PubSub.unsubscribe(exportToken);
      brushCursorHandlers.forEach(({ element, enter, leave }) => {
        element.removeEventListener("pointerenter", enter);
        element.removeEventListener("pointerleave", leave);
      });
      voiModifiedHandlers.forEach(({ element, handler }) => {
        element.removeEventListener(VOI_MODIFIED, handler);
      });
      cameraModifiedHandlers.forEach(({ element, handler }) => {
        element.removeEventListener(CAMERA_MODIFIED, handler);
      });
      if (enableMaskEditing) {
        setMaskActorsVisibility(false);
      }
      if (maskSessionRef.current.historyTimer) {
        clearTimeout(maskSessionRef.current.historyTimer);
      }
      clearInitialLesionFocusTimer();
    };
  }, [effectiveOutputPath, enableMaskEditing, inputPath, pflag, selectedSeries, volumeIds]);

  useEffect(() => {
    if (renderingEngine && volumeLoaded.current) {
      removeCameraSynchronizers(preMPR.current);
      const viewport_PET_CT = renderingEngine.getViewport(
        viewportIds[3]
      ) as Types.IVolumeViewport;
      const fusionVolumeId = volumeIds[ctVolumeIndex];

      if (!viewport_PET_CT || !fusionVolumeId) {
        return;
      }

      const hasFusionActor = viewport_PET_CT
        .getActors()
        .some((actor) => actor.uid === fusionVolumeId);

      if (!hasFusionActor) {
        return;
      }

      const imageData = viewport_PET_CT.getImageData(fusionVolumeId);
      if (!imageData) {
        return;
      }

      const dimensions = imageData.dimensions;
      switch (MPR) {
        case "AXIAL":
          viewport_PET_CT.setOrientation(Enums.OrientationAxis.AXIAL);
          break;
        case "SAGITTAL":
          viewport_PET_CT.setOrientation(Enums.OrientationAxis.SAGITTAL);
          break;
        case "CORONAL":
          viewport_PET_CT.setOrientation(Enums.OrientationAxis.CORONAL);
          break;
        default:
          break;
      }
      setUpCameraSynchronizers(MPR);
      preMPR.current = MPR;
      viewport_PET_CT.render();
      changePET_CT_Num(dimensions, MPR, setPET_CT_Index);
    }
  }, [MPR, ctVolumeIndex, volumeIds]);

  useEffect(() => {
    const resizeViewports = () => {
      if (!renderingEngine || !volumeLoaded.current) {
        return;
      }

      renderingEngine.resize();
      renderingEngine.render();
    };

    const element = imgShowRef.current;
    if (!element) {
      return undefined;
    }

    let frameId = 0;
    let resizeTimer: number | null = null;
    const queueResize = () => {
      window.cancelAnimationFrame(frameId);
      if (resizeTimer) {
        window.clearTimeout(resizeTimer);
      }

      resizeTimer = window.setTimeout(() => {
        frameId = window.requestAnimationFrame(resizeViewports);
      }, 80);
    };

    const resizeObserver = new ResizeObserver(queueResize);
    resizeObserver.observe(element);
    window.addEventListener("resize", queueResize);

    return () => {
      window.cancelAnimationFrame(frameId);
      if (resizeTimer) {
        window.clearTimeout(resizeTimer);
      }
      resizeObserver.disconnect();
      window.removeEventListener("resize", queueResize);
    };
  }, [volumeLoaded]);

  const wheelOnChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    viewportId: string
  ) => {
    const newIndex = parseInt(e.target.value) - 1;
    const viewport = renderingEngine.getViewport(viewportId);
    jumpToSlice(viewport.element, {
      imageIndex: newIndex,
    });
  };

  const getViewportWindowLevel = (viewportId: string) =>
    windowLevels[viewportId] ?? defaultWindowLevelState;

  return (
    <div className="ImgShow" id="content" ref={imgShowRef}>
      {enableMaskEditing && maskBanner ? <div className="maskBanner">{maskBanner}</div> : null}
      {showLoadingProgress && maskLoading.active ? (
        <div className="maskLoading">
          <div className="maskLoadingText">
            <span>{maskLoading.text}</span>
            <span>{maskLoading.percent}%</span>
          </div>
          <div className="maskProgressTrack">
            <div
              className="maskProgressFill"
              style={{ width: `${maskLoading.percent}%` }}
            />
          </div>
        </div>
      ) : null}
      <div className="viewportGrid" id="viewportGrid">
        <div className="element element1_1">
          <div
            className="viewport"
            id="element1_1"
            onContextMenu={(e) => e.preventDefault()}
          >
            <div className="img_viewport_content">
              <div>
                <span className="title">Img: </span>
                <span>{`${PET_AXIAL_Index}/${PET_AXIAL_Num}`}</span>
              </div>
              <div>
                <span className="title">W&nbsp;:&nbsp; </span>
                <span>
                  {formatWindowLevelValue(
                    getViewportWindowLevel(viewportIds[0]).width
                  )}
                </span>
              </div>
              <div>
                <span className="title">L&nbsp;&nbsp;&nbsp;:&nbsp; </span>
                <span>
                  {formatWindowLevelValue(
                    getViewportWindowLevel(viewportIds[0]).center
                  )}
                </span>
              </div>
            </div>
            <div className="img_viewport_pInfo">
              <div> {pID} </div>
              <div> {pname} </div>
              <div> {scanTime} </div>
            </div>
          </div>
          <div className="scroll">
            <div className="scroll-holder">
              <input
                className="imageSlider"
                value={PET_AXIAL_Index}
                type="range"
                min={1}
                max={PET_AXIAL_Num}
                step={1}
                onChange={(e) => wheelOnChange(e, viewportIds[0])}
              />
            </div>
          </div>
        </div>

        <div className="element element1_2">
          <div
            className="viewport"
            id="element1_2"
            onContextMenu={(e) => e.preventDefault()}
          >
            <div className="img_viewport_content">
              <div>
                <span className="title">Img: </span>
                <span>{`${PET_CORONAL_Index}/${PET_CORONAL_Num}`}</span>
              </div>
              <div>
                <span className="title">W&nbsp;:&nbsp; </span>
                <span>
                  {formatWindowLevelValue(
                    getViewportWindowLevel(viewportIds[1]).width
                  )}
                </span>
              </div>
              <div>
                <span className="title">L&nbsp;&nbsp;&nbsp;:&nbsp; </span>
                <span>
                  {formatWindowLevelValue(
                    getViewportWindowLevel(viewportIds[1]).center
                  )}
                </span>
              </div>
            </div>
            <div className="img_viewport_pInfo">
              <div> {pID} </div>
              <div> {pname} </div>
              <div> {scanTime} </div>
            </div>
          </div>
          <div className="scroll">
            <div className="scroll-holder">
              <input
                className="imageSlider"
                value={PET_CORONAL_Index}
                type="range"
                min={1}
                max={PET_CORONAL_Num}
                step={1}
                onChange={(e) => wheelOnChange(e, viewportIds[1])}
              />
            </div>
          </div>
        </div>

        <div className="element element2_1">
          <div
            className="viewport"
            id="element2_1"
            onContextMenu={(e) => e.preventDefault()}
          >
            <div className="img_viewport_content">
              <div>
                <span className="title">Img: </span>
                <span>{`${PET_SAGITTAL_Index}/${PET_SAGITTAL_Num}`}</span>
              </div>
              <div>
                <span className="title">W&nbsp;:&nbsp; </span>
                <span>
                  {formatWindowLevelValue(
                    getViewportWindowLevel(viewportIds[2]).width
                  )}
                </span>
              </div>
              <div>
                <span className="title">L&nbsp;&nbsp;&nbsp;:&nbsp; </span>
                <span>
                  {formatWindowLevelValue(
                    getViewportWindowLevel(viewportIds[2]).center
                  )}
                </span>
              </div>
            </div>
            <div className="img_viewport_pInfo">
              <div> {pID} </div>
              <div> {pname} </div>
              <div> {scanTime} </div>
            </div>
          </div>
          <div className="scroll">
            <div className="scroll-holder">
              <input
                className="imageSlider"
                value={PET_SAGITTAL_Index}
                type="range"
                min={1}
                max={PET_SAGITTAL_Num}
                step={1}
                onChange={(e) => wheelOnChange(e, viewportIds[2])}
              />
            </div>
          </div>
        </div>

        <div className="element element2_2">
          <div
            className="viewport"
            id="element2_2"
            onContextMenu={(e) => e.preventDefault()}
          >
            <div className="img_viewport_content">
              <div>
                <span className="title">Img: </span>
                <span>{`${PET_CT_Index}/${PET_CT_Num}`}</span>
              </div>
              <div>
                <span className="title">W&nbsp;:&nbsp; </span>
                <span>
                  {formatWindowLevelValue(
                    getViewportWindowLevel(viewportIds[3]).width
                  )}
                </span>
              </div>
              <div>
                <span className="title">L&nbsp;&nbsp;&nbsp;:&nbsp; </span>
                <span>
                  {formatWindowLevelValue(
                    getViewportWindowLevel(viewportIds[3]).center
                  )}
                </span>
              </div>
            </div>
            <div className="img_viewport_pInfo">
              <div> {pID} </div>
              <div> {pname} </div>
              <div> {scanTime} </div>
            </div>

            <div className="MPR_Switch">
              <div
                className={MPR === "AXIAL" ? "selected" : ""}
                onClick={() => setMPR("AXIAL")}
              >
                AXIAL
              </div>
              <div
                className={MPR === "CORONAL" ? "selected" : ""}
                onClick={() => setMPR("CORONAL")}
              >
                CORONAL
              </div>
              <div
                className={MPR === "SAGITTAL" ? "selected" : ""}
                onClick={() => setMPR("SAGITTAL")}
              >
                SAGITTAL
              </div>
            </div>
          </div>
          <div className="scroll">
            <div className="scroll-holder">
              <input
                className="imageSlider"
                value={PET_CT_Index}
                type="range"
                min={1}
                max={PET_CT_Num}
                step={1}
                onChange={(e) => wheelOnChange(e, viewportIds[3])}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ImgShow;
