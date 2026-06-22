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
  setUpCameraSynchronizers,
  removeCameraSynchronizers,
  setToolPassiveFun,
} from "./functions/cornerstoneAddTools";
import { renderingEngineId, viewportIds } from "./functions/getConstant";
import loadImages from "./functions/loadImages";
import {
  MASK_BRUSH_SIZE_TOPIC,
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
} from "./functions/segmentationApi";
// import axios from "axios";

const { ViewportType } = Enums;
const { CAMERA_MODIFIED } = Enums.Events;
const { getImageSliceDataForVolumeViewport } = csUtils;
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
const SEGMENTATION_ID_PREFIX = "NUCAD_SEGMENTATION";
const BRUSH_STRATEGY = "FILL_INSIDE_CIRCLE";
const ERASE_STRATEGY = "ERASE_INSIDE_CIRCLE";

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
  dirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  undoStack: Uint8Array[];
  redoStack: Uint8Array[];
  committedSnapshot: Uint8Array | null;
  pendingHistory: boolean;
  historyTimer: ReturnType<typeof setTimeout> | null;
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
  message: "Mask未初始化",
  mode: "none",
  brushSize: 25,
  dirty: false,
  canUndo: false,
  canRedo: false,
  undoStack: [],
  redoStack: [],
  committedSnapshot: null,
  pendingHistory: false,
  historyTimer: null,
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
  if (!getRenderingEngine(renderingEngineId)) {
    renderingEngine = new RenderingEngine(renderingEngineId);
    elements = document.getElementsByClassName("viewport");
  }

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
  if (pflag === "2") {
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
}

const ImgShow: React.FC<ImgShowProps> = (props) => {
  const patientInfo = useAppSelector((state) => state.patient.patientInfo);
  const { seriesId, pname, scanTime, pID, inputPath, outputPath, pflag } =
    patientInfo;
  const { volumeLoaded } = useContext(ImgPageContext);
  const { volumeIds } = props;
  const [PET_AXIAL_Index, setPET_AXIAL_Index] = useState(0);
  const [PET_CORONAL_Index, setPET_CORONAL_Index] = useState(0);
  const [PET_SAGITTAL_Index, setPET_SAGITTAL_Index] = useState(0);
  const [PET_CT_Index, setPET_CT_Index] = useState(0);
  const [MPR, setMPR] = useState("AXIAL");
  const [maskBanner, setMaskBanner] = useState("");
  const [maskLoading, setMaskLoading] = useState<MaskLoadingState>({
    active: false,
    percent: 0,
    text: "",
  });
  const preMPR = useRef("AXIAL");
  const maskSessionRef = useRef<MaskSessionState>(createInitialMaskSessionState());

  const setMaskLoadingProgress = (percent: number, text: string) => {
    setMaskLoading({
      active: true,
      percent,
      text,
    });
  };

  const finishMaskLoadingProgress = () => {
    setMaskLoading((previous) => ({
      ...previous,
      active: false,
      percent: 100,
    }));
  };

  const publishMaskState = () => {
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
    };

    PubSub.publish(MASK_STATE_TOPIC, payload);
  };

  const updateMaskState = (partial: Partial<MaskSessionState>) => {
    Object.assign(maskSessionRef.current, partial);
    setMaskBanner(maskSessionRef.current.message);
    publishMaskState();
  };

  const getSegmentationVolume = () =>
    cache.getVolume(maskSessionRef.current.segmentationVolumeId);

  const triggerSegmentationRender = () => {
    const maskSession = maskSessionRef.current;

    if (!maskSession.segmentationId) {
      return;
    }

    segmentation.triggerSegmentationEvents.triggerSegmentationDataModified(
      maskSession.segmentationId
    );
    renderingEngine?.render();
  };

  const applyScalarDataToSegmentation = (nextData: Uint8Array) => {
    const segmentationVolume = getSegmentationVolume();

    if (!segmentationVolume) {
      return;
    }

    const scalarData = segmentationVolume.getScalarData() as Uint8Array;
    scalarData.set(nextData);
    triggerSegmentationRender();
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
      canRedo: maskSessionRef.current.redoStack.length > 0,
      message:
        maskSessionRef.current.source === "none"
          ? "空白Mask已编辑"
          : "Mask已修改，尚未保存",
    });
  };

  const queueHistorySnapshot = () => {
    const maskSession = maskSessionRef.current;

    if (!maskSession.committedSnapshot) {
      return;
    }

    if (!maskSession.pendingHistory) {
      maskSession.undoStack.push(cloneScalarData(maskSession.committedSnapshot));
      maskSession.redoStack = [];
      maskSession.pendingHistory = true;
    }

    if (maskSession.historyTimer) {
      clearTimeout(maskSession.historyTimer);
    }

    maskSession.historyTimer = setTimeout(finalizeHistoryStep, 250);
    updateMaskState({
      canUndo: maskSession.undoStack.length > 0,
      canRedo: false,
    });
  };

  const initializeSegmentation = async () => {
    setMaskLoadingProgress(5, "Initializing Mask...");
    if (pflag === "2" || !volumeIds.length) {
      updateMaskState({
        ready: false,
        source: "none",
        message: "当前病例无可编辑Mask",
      });
      finishMaskLoadingProgress();
      return;
    }

    const referencedVolume = cache.getVolume(volumeIds[0]);
    setMaskLoadingProgress(15, "Reading reference volume...");

    if (!referencedVolume) {
      updateMaskState({
        ready: false,
        source: "error",
        message: "未找到参考体数据，无法初始化Mask",
      });
      finishMaskLoadingProgress();
      return;
    }

    const scalarLength = (referencedVolume.getScalarData() as Uint8Array).length;
    const blankMask = new Uint8Array(scalarLength);
    let scalarData = blankMask;
    let source: MaskToolbarStatePayload["source"] = "empty";
    let message = "未找到算法Mask，当前使用空白Mask";

    if (outputPath) {
      try {
        setMaskLoadingProgress(30, "Loading saved segmentation...");
        const response = await loadSegmentation(seriesId, outputPath);
        setMaskLoadingProgress(55, "Preparing segmentation data...");

        if (
          response.success &&
          response.exists &&
          response.scalarDataBase64 &&
          response.dimensions
        ) {
          const loadedMask = base64ToUint8Array(response.scalarDataBase64);
          setMaskLoadingProgress(70, "Checking mask dimensions...");
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
          message = response.message || "Mask加载失败";
        }
      } catch (error) {
        source = "error";
        message = "Mask加载失败，当前使用空白Mask";
      }
    } else {
      message = "当前病例缺少outputPath，无法加载算法Mask";
    }

    setMaskLoadingProgress(85, "Creating editable overlay...");
    const runtimeSuffix = `${seriesId}:${Date.now()}`;
    const segmentationId = `${SEGMENTATION_ID_PREFIX}:${runtimeSuffix}`;
    const segmentationVolumeId = `${SEGMENTATION_VOLUME_PREFIX}:${runtimeSuffix}`;
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
      brushSize: 25,
      dirty: false,
      canUndo: false,
      canRedo: false,
      undoStack: [],
      redoStack: [],
      committedSnapshot: cloneScalarData(
        segmentationVolume.getScalarData() as Uint8Array
      ),
      mode: "none",
    });
    window.setTimeout(finishMaskLoadingProgress, 350);
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
    VolumeToolGroup.setActiveStrategy(
      BrushTool.toolName,
      mode === "erase" ? ERASE_STRATEGY : BRUSH_STRATEGY
    );
    VolumeToolGroup.setToolActive(BrushTool.toolName, {
      bindings: [{ mouseButton: MouseBindings.Primary }],
    });
    updateMaskState({
      mode,
      message: mode === "erase" ? "橡皮模式已启用" : "画刷模式已启用",
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

    if (!maskSession.ready) {
      return;
    }

    const nextVisibility = !maskSession.visible;
    segmentation.config.visibility.setSegmentationVisibility(
      VolumeToolGroup.id,
      maskSession.segmentationRepresentationUID,
      nextVisibility
    );
    renderingEngine?.render();
    updateMaskState({
      visible: nextVisibility,
      message: nextVisibility ? "Mask已显示" : "Mask已隐藏",
    });
  };

  const changeBrushSize = (delta: number) => {
    const maskSession = maskSessionRef.current;
    const nextSize = Math.max(1, maskSession.brushSize + delta);

    setBrushSizeForToolGroup(VolumeToolGroup.id, nextSize);
    updateMaskState({
      brushSize: nextSize,
      message: `画刷半径已调整为 ${nextSize}`,
    });
  };

  const undoMaskEdit = () => {
    const maskSession = maskSessionRef.current;

    if (!maskSession.undoStack.length) {
      return;
    }

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
    applyScalarDataToSegmentation(previousSnapshot);
    updateMaskState({
      committedSnapshot: cloneScalarData(previousSnapshot),
      canUndo: maskSession.undoStack.length > 0,
      canRedo: true,
      dirty: true,
      message: "已撤销上一步Mask编辑",
    });
  };

  const redoMaskEdit = () => {
    const maskSession = maskSessionRef.current;

    if (!maskSession.redoStack.length) {
      return;
    }

    const segmentationVolume = getSegmentationVolume();

    if (!segmentationVolume) {
      return;
    }

    const currentSnapshot = cloneScalarData(
      segmentationVolume.getScalarData() as Uint8Array
    );
    const nextSnapshot = maskSession.redoStack.pop();

    if (!nextSnapshot) {
      return;
    }

    maskSession.undoStack.push(currentSnapshot);
    applyScalarDataToSegmentation(nextSnapshot);
    updateMaskState({
      committedSnapshot: cloneScalarData(nextSnapshot),
      canUndo: true,
      canRedo: maskSession.redoStack.length > 0,
      dirty: true,
      message: "已恢复Mask编辑",
    });
  };

  const saveCurrentMask = async () => {
    const maskSession = maskSessionRef.current;
    const segmentationVolume = getSegmentationVolume();
    const referencedVolume = cache.getVolume(maskSession.referencedVolumeId);

    if (!maskSession.ready || !segmentationVolume || !referencedVolume || !outputPath) {
      updateMaskState({
        message: "当前病例缺少保存Mask所需的信息",
      });
      return;
    }

    try {
      const scalarData = segmentationVolume.getScalarData() as Uint8Array;
      await saveSegmentation(seriesId, {
        outputPath,
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
      });
      updateMaskState({
        dirty: false,
        source: "doctor",
        committedSnapshot: cloneScalarData(scalarData),
        message:
          scalarData.some((value) => value > 0)
            ? "Mask已保存为医生修订版"
            : "已保存空白Mask，可作为医生确认阴性结果",
      });
    } catch (error) {
      updateMaskState({
        message: "Mask保存失败",
      });
    }
  };

  useEffect(() => {
    updateMaskState(createInitialMaskSessionState());
    const brushCursorHandlers: Array<{
      element: Element;
      enter: EventListener;
      leave: EventListener;
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

    volumes = initAndGetImageIds(
      renderingEngineId,
      inputPath,
      outputPath,
      volumeIds,
      pflag
    );
    volumes.then(async (value) => {
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
      attachBrushCursorHandlers();
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
      const dimensions = viewport_PET.getImageData(volumeIds[0]).dimensions;
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
      await initializeSegmentation();
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
    const undoToken = PubSub.subscribe(MASK_UNDO_TOPIC, () => {
      undoMaskEdit();
    });
    const redoToken = PubSub.subscribe(MASK_REDO_TOPIC, () => {
      redoMaskEdit();
    });
    const saveToken = PubSub.subscribe(MASK_SAVE_TOPIC, () => {
      saveCurrentMask();
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
      PubSub.unsubscribe(undoToken);
      PubSub.unsubscribe(redoToken);
      PubSub.unsubscribe(saveToken);
      brushCursorHandlers.forEach(({ element, enter, leave }) => {
        element.removeEventListener("pointerenter", enter);
        element.removeEventListener("pointerleave", leave);
      });
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
      const dimensions = viewport_PET_CT.getImageData(fusionVolumeId).dimensions;
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

  return (
    <div className="ImgShow" id="content">
      {maskBanner ? <div className="maskBanner">{maskBanner}</div> : null}
      {maskLoading.active ? (
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
                <span>400</span>
              </div>
              <div>
                <span className="title">L&nbsp;&nbsp;&nbsp;:&nbsp; </span>
                <span>40</span>
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
                <span>400</span>
              </div>
              <div>
                <span className="title">L&nbsp;&nbsp;&nbsp;:&nbsp; </span>
                <span>40</span>
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
                <span>400</span>
              </div>
              <div>
                <span className="title">L&nbsp;&nbsp;&nbsp;:&nbsp; </span>
                <span>40</span>
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
                <span>400</span>
              </div>
              <div>
                <span className="title">L&nbsp;&nbsp;&nbsp;:&nbsp; </span>
                <span>40</span>
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
