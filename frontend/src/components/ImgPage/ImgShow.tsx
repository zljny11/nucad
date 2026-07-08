import React, { useEffect, useState, useRef, useContext } from "react";
import { useAppSelector } from "../../redux/hooks";
import PubSub from "pubsub-js";
import ImgPageContext from "./functions/ImgPageContext";
import { safeWindowRequire } from "../../utils/electron";
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
import loadImages from "./functions/loadImages";
import {
  MASK_BRUSH_SIZE_TOPIC,
  MASK_BRUSH_SHAPE_TOPIC,
  MASK_EXPORT_TOPIC,
  MASK_REDO_TOPIC,
  MASK_SAVE_TOPIC,
  MASK_SET_MODE_TOPIC,
  MASK_STATE_TOPIC,
  MASK_TOGGLE_VISIBILITY_TOPIC,
  MASK_UNDO_TOPIC,
} from "./functions/maskEvents";
import {
  exportSegmentation,
  loadSegmentation,
  saveSegmentation,
  SegmentationSavePayload,
} from "./functions/segmentationApi";
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
const SEGMENTATION_VOLUME_PREFIX = "NUCAD_SEGMENTATION_VOLUME";
const BRUSH_STRATEGY = "FILL_INSIDE_CIRCLE";
const ERASE_STRATEGY = "ERASE_INSIDE_CIRCLE";
const DEFAULT_MASK_BRUSH_SIZE = 8;
type BrushShape = "circle" | "square";
const electron = safeWindowRequire ? safeWindowRequire("electron") : null;
const ipcRenderer = electron?.ipcRenderer;

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

const getEffectiveOutputPath = (outputPath: string, inputPath: string) => {
  const trimmedOutputPath = String(outputPath || "").trim();

  if (trimmedOutputPath) {
    return trimmedOutputPath;
  }

  const normalizedInputPath = String(inputPath || "").trim();
  const pathMarkers = [
    { input: "/config/input/", output: "/config/output/" },
    { input: "\\config\\input\\", output: "\\config\\output\\" },
  ];
  const matchedMarker = pathMarkers.find((marker) =>
    normalizedInputPath.includes(marker.input)
  );

  if (matchedMarker) {
    return normalizedInputPath.replace(matchedMarker.input, matchedMarker.output);
  }

  return "";
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
  Object.values(elements).forEach((element, index) => {
    // 监听鼠标滚轮滚动
    element.addEventListener(CAMERA_MODIFIED, () => {
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
    });
  });
};

const initAndGetImageIds = async (
  renderingEngineId: string,
  inputPath: string,
  outputPath: string,
  volumeIds: string[],
  pflag: string
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
  const path = [
    inputPath.slice(0, inputPath.length - 2) + "CT",
    inputPath,
    outputPath + "/out/out",
  ];
  let imageIds: string[][] = [];
  if (pflag === "2" || pflag === "6") {
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
  pflag: string
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

  pflag === "1"
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
        volumeId: volumeIds[pflag === "1" ? 2 : 1],
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
  const { volumeIds, enableMaskEditing = false } = props;
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
  const maskSessionRef = useRef<MaskSessionState>(createInitialMaskSessionState());

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

  const saveCurrentMask = async () => {
    const payload = getCurrentMaskPayload();

    if (!payload || !effectiveOutputPath) {
      updateMaskState({
        message: "Missing information required to save the mask",
      });
      return;
    }

    try {
      const result = await saveSegmentation(seriesId, payload);
      const scalarData = base64ToUint8Array(payload.scalarDataBase64);
      updateMaskState({
        dirty: false,
        source: "doctor",
        committedSnapshot: cloneScalarData(scalarData),
        savedSnapshot: cloneScalarData(scalarData),
        undoStack: [],
        redoStack: [],
        canUndo: false,
        canRedo: false,
        message:
          scalarData.some((value) => value > 0)
            ? `Mask saved as doctor revision: ${result.path || "doctor_mask.nii.gz"}`
            : `Saved a blank mask: ${result.path || "doctor_mask.nii.gz"}`,
      });
    } catch (error) {
      updateMaskState({
        message: "Mask save failed",
      });
    }
  };

  const exportCurrentMask = async () => {
    const payload = getCurrentMaskPayload();

    if (!payload) {
      updateMaskState({
        message: "Missing information required to export the mask",
      });
      return;
    }

    if (!ipcRenderer) {
      updateMaskState({
        message: "当前环境无法打开Mask导出窗口",
      });
      return;
    }

    try {
      const defaultFileName = `${seriesId || "doctor"}_doctor_mask.nii.gz`;
      const exportPath = await ipcRenderer.invoke(
        "select-mask-export-path",
        defaultFileName
      );

      if (!exportPath) {
        updateMaskState({
          message: "已取消导出Mask",
        });
        return;
      }

      const result = await exportSegmentation(seriesId, {
        ...payload,
        exportPath,
      });

      updateMaskState({
        message: `Mask exported: ${result.path || exportPath}`,
      });
    } catch (error) {
      updateMaskState({
        message: "Mask export failed",
      });
    }
  };

  useEffect(() => {
    volumeLoaded.current = false;
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
      pflag
    );
    volumes.then(async (value) => {
      setMaskLoadingProgress(8, "Preparing viewports...");
      await new Promise((resolve) => window.requestAnimationFrame(resolve));
      await createViewportAndRender(
        elements,
        renderingEngineId,
        renderingEngine,
        viewportIds,
        volumeIds,
        value,
        pflag
      );
      setMaskLoadingProgress(18, "Rendering image volumes...");
      attachBrushCursorHandlers();
      attachVoiModifiedHandlers();
      viewportIds.forEach(refreshViewportWindowLevel);
      wheelEventListener(
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
      viewportIds.forEach((viewportId, index) => {
        if (index !== 3) {
          const viewport = renderingEngine.getViewport(viewportId);
          jumpToSlice(viewport.element, {
            imageIndex:
              index === 1 ? PET_CORONAL_Num - data[2 - index] : data[2 - index],
          });
          switch (index) {
            case 0:
              setPET_AXIAL_Index(data[2] + 1);
              break;
            case 1:
              setPET_CORONAL_Index(PET_CORONAL_Num - data[1] + 1);
              break;
            case 2:
              setPET_SAGITTAL_Index(data[0] + 1);
              break;
            default:
              break;
          }
        }
      });
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
      saveCurrentMask();
    });
    const exportToken = PubSub.subscribe(MASK_EXPORT_TOPIC, () => {
      exportCurrentMask();
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
      eventTarget.removeEventListener(
        CsToolsEvents.SEGMENTATION_DATA_MODIFIED,
        segmentationModifiedHandler
      );
      PubSub.unsubscribe(jumpToken);
      PubSub.unsubscribe(modeToken);
      PubSub.unsubscribe(visibilityToken);
      PubSub.unsubscribe(brushSizeToken);
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
      if (enableMaskEditing) {
        setMaskActorsVisibility(false);
      }
      if (maskSessionRef.current.historyTimer) {
        clearTimeout(maskSessionRef.current.historyTimer);
      }
    };
  }, []);

  useEffect(() => {
    if (renderingEngine && volumeLoaded.current) {
      removeCameraSynchronizers(preMPR.current);
      const viewport_PET_CT = renderingEngine.getViewport(
        viewportIds[3]
      ) as Types.IVolumeViewport;
      const fusionVolumeId = volumeIds[pflag === "1" ? 2 : 1];

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
  }, [MPR]);

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
