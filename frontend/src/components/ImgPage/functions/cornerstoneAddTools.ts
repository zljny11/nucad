import {
  Enums as CoreEnums,
  getEnabledElement,
  getEnabledElementByIds,
  utilities as csUtils,
} from "@cornerstonejs/core";
import * as cornerstoneTools from "@cornerstonejs/tools";
import { fillInsideRectangle } from "@cornerstonejs/tools/dist/esm/tools/segmentation/strategies/fillRectangle";
import { eraseInsideRectangle } from "@cornerstonejs/tools/dist/esm/tools/segmentation/strategies/eraseRectangle";
import { renderingEngineId, viewportIds } from "./getConstant";

const {
  ToolGroupManager,
  WindowLevelTool,
  PanTool,
  ZoomTool,
  StackScrollMouseWheelTool,
  DragProbeTool,
  synchronizers,
  SynchronizerManager,
  CrosshairsTool,
  BrushTool,
  SegmentationDisplayTool,
} = cornerstoneTools;
const { createCameraPositionSynchronizer, createVOISynchronizer } =
  synchronizers;
const { getSynchronizer } = SynchronizerManager;

const ZOOM_SENSITIVITY = 0.65;
const SQUARE_BRUSH_FILL_STRATEGY = "FILL_INSIDE_SQUARE";
const SQUARE_BRUSH_ERASE_STRATEGY = "ERASE_INSIDE_SQUARE";
const crosshairReferenceViewportIds = viewportIds.slice(0, 3);

class NuCadZoomTool extends ZoomTool {
  static toolName = "NuCadZoom";

  private withScaledZoomDelta(evt: any, callback: () => void) {
    const detail = evt.detail as any;
    const canvasDelta = detail.deltaPoints?.canvas;
    const touchDelta = detail.deltaDistance;
    const originalCanvasY = canvasDelta?.[1];
    const originalTouchCanvas = touchDelta?.canvas;

    if (typeof originalCanvasY === "number") {
      canvasDelta[1] = originalCanvasY * ZOOM_SENSITIVITY;
    }
    if (typeof originalTouchCanvas === "number") {
      touchDelta.canvas = originalTouchCanvas * ZOOM_SENSITIVITY;
    }

    try {
      callback();
    } finally {
      if (typeof originalCanvasY === "number") {
        canvasDelta[1] = originalCanvasY;
      }
      if (typeof originalTouchCanvas === "number") {
        touchDelta.canvas = originalTouchCanvas;
      }
    }
  }

  _dragCallback(evt: any) {
    this.withScaledZoomDelta(evt, () => super._dragCallback(evt));
  }

  _pinchCallback(evt: any) {
    this.withScaledZoomDelta(evt, () => super._pinchCallback(evt));
  }
}

class NuCadWindowLevelTool extends WindowLevelTool {
  static toolName = "NuCadWindowLevel";

  getPTScaledNewRange({
    deltaPointsCanvas,
    lower,
    upper,
    clientHeight,
    viewport,
    volumeId,
    isPreScaled,
  }: any) {
    const multiplier = isPreScaled
      ? 5 / clientHeight
      : (this as any)._getMultiplierFromDynamicRange(viewport, volumeId) || 4;
    const wwDelta = deltaPointsCanvas[0] * multiplier;
    const wcDelta = deltaPointsCanvas[1] * multiplier;
    let { windowWidth, windowCenter } = csUtils.windowLevel.toWindowLevel(
      lower,
      upper
    );

    windowWidth = Math.max(windowWidth + wwDelta, isPreScaled ? 0.1 : 1);
    windowCenter += wcDelta;

    const nextRange = csUtils.windowLevel.toLowHighRange(
      windowWidth,
      windowCenter
    );

    if (isPreScaled) {
      nextRange.lower = Math.max(nextRange.lower, 0);
      nextRange.upper = Math.max(nextRange.upper, 0.1);
    }

    return nextRange;
  }
}

class NuCadDragProbeTool extends DragProbeTool {
  static toolName = "NuCadDragProbe";

  renderAnnotation = (
    enabledElement: any,
    svgDrawingHelper: any
  ): boolean => {
    let renderStatus = false;
    const { viewport } = enabledElement;

    if (!this.editData) {
      return renderStatus;
    }

    const annotations = this.filterInteractableAnnotationsForElement(
      viewport.element,
      [this.editData.annotation]
    );

    if (!annotations?.length) {
      return renderStatus;
    }

    const targetId = this.getTargetId(viewport);
    const renderingEngine = viewport.getRenderingEngine();
    const styleSpecifier: any = {
      toolGroupId: this.toolGroupId,
      toolName: this.getToolName(),
      viewportId: enabledElement.viewport.id,
    };

    const annotation = this.editData.annotation;
    const annotationUID = annotation.annotationUID;
    const data = annotation.data;
    const point = data.handles.points[0];
    const canvasCoordinates = viewport.worldToCanvas(point);

    styleSpecifier.annotationUID = annotationUID;

    const color = this.getStyle("color", styleSpecifier, annotation);

    if (!data.cachedStats[targetId]) {
      data.cachedStats[targetId] = {
        Modality: null,
        index: null,
        value: null,
      };
      this._calculateCachedStats(annotation, renderingEngine, enabledElement);
    } else if (annotation.invalidated) {
      this._calculateCachedStats(annotation, renderingEngine, enabledElement);
    }

    if (!viewport.getRenderingEngine()) {
      console.warn("Rendering Engine has been destroyed");
      return renderStatus;
    }

    const arrowStart = [
      canvasCoordinates[0] + 16,
      canvasCoordinates[1] + 16,
    ] as [number, number];
    (cornerstoneTools as any).drawing.drawArrow(
      svgDrawingHelper,
      annotationUID,
      "probe-arrow",
      arrowStart,
      canvasCoordinates,
      { color }
    );

    renderStatus = true;

    const isPreScaled = (cornerstoneTools as any).utilities.viewport
      .isViewportPreScaled(viewport, targetId);
    const isSuvScaled = this.isSuvScaled(
      viewport,
      targetId,
      annotation.metadata.referencedImageId
    );
    const textLines = this._getTextLines(
      data,
      targetId,
      isPreScaled,
      isSuvScaled
    );

    if (textLines) {
      const textCanvasCoordinates = [
        canvasCoordinates[0] + 6,
        canvasCoordinates[1] - 6,
      ];
      (cornerstoneTools as any).drawing.drawTextBox(
        svgDrawingHelper,
        annotationUID,
        "0",
        textLines,
        [textCanvasCoordinates[0], textCanvasCoordinates[1]],
        this.getLinkedTextBoxStyle(styleSpecifier, annotation)
      );
    }

    return renderStatus;
  };
}

class NuCadCrosshairsTool extends CrosshairsTool {
  static toolName = CrosshairsTool.toolName;

  constructor(...args: any[]) {
    super(...args);
    const originalMouseMoveCallback = this.mouseMoveCallback?.bind(this);
    const originalComputeToolCenter = this.computeToolCenter?.bind(this);
    const originalRenderAnnotation = this.renderAnnotation?.bind(this);
    const originalAddNewAnnotation = this.addNewAnnotation?.bind(this);
    const originalGetAnnotationsForDifferentCameras =
      this._getAnnotationsForViewportsWithDifferentCameras?.bind(this);
    const originalFilterAnnotationsByUniqueOrientations =
      this._filterAnnotationsByUniqueViewportOrientations?.bind(this);
    const filterCrosshairAnnotations = (annotations: any[] = []) =>
      annotations.filter((annotation) =>
        crosshairReferenceViewportIds.includes(annotation?.data?.viewportId)
      );

    this.mouseMoveCallback = (evt: any, filteredToolAnnotations: any[] = []): boolean => {
      if (!originalMouseMoveCallback || !filteredToolAnnotations.length) {
        return false;
      }

      return originalMouseMoveCallback(evt, filteredToolAnnotations);
    };

    this.computeToolCenter = (viewportsInfo: any[]): void => {
      if (!originalComputeToolCenter || viewportsInfo.length < 2) {
        return;
      }

      const primaryViewportsInfo = viewportsInfo.filter((viewportInfo) =>
        crosshairReferenceViewportIds.includes(viewportInfo.viewportId)
      );

      if (primaryViewportsInfo.length < 2) {
        return;
      }

      originalComputeToolCenter(primaryViewportsInfo);
      const enabledElement = getEnabledElementByIds(
        primaryViewportsInfo[0].viewportId,
        primaryViewportsInfo[0].renderingEngineId
      );
      enabledElement?.renderingEngine.render();
    };

    this.addNewAnnotation = (evt: any) => {
      if (!originalAddNewAnnotation) {
        return null;
      }

      const element = evt?.detail?.element;
      const enabledElement = element ? getEnabledElement(element) : null;

      if (enabledElement) {
        const currentViewportId = enabledElement.viewport?.id;
        const currentRenderingEngineId = enabledElement.renderingEngine?.id;
        const annotations = this._getAnnotations(enabledElement);
        const filteredAnnotations =
          this.filterInteractableAnnotationsForElement(
            enabledElement.viewport.element,
            annotations
          );

        if (!filteredAnnotations.length && currentViewportId && currentRenderingEngineId) {
          this.initializeViewport({
            viewportId: currentViewportId,
            renderingEngineId: currentRenderingEngineId,
          });
        }
      }

      return originalAddNewAnnotation(evt);
    };

    this._getAnnotationsForViewportsWithDifferentCameras = (
      enabledElement: any,
      annotations: any[] = []
    ) => {
      if (!originalGetAnnotationsForDifferentCameras) {
        return [];
      }

      return originalGetAnnotationsForDifferentCameras(
        enabledElement,
        filterCrosshairAnnotations(annotations)
      );
    };

    this._filterAnnotationsByUniqueViewportOrientations = (
      enabledElement: any,
      annotations: any[] = []
    ) => {
      if (!originalFilterAnnotationsByUniqueOrientations) {
        return [];
      }

      return originalFilterAnnotationsByUniqueOrientations(
        enabledElement,
        filterCrosshairAnnotations(annotations)
      );
    };

    this.renderAnnotation = (enabledElement: any, svgDrawingHelper: any) => {
      if (!originalRenderAnnotation) {
        return false;
      }

      const renderStatus = originalRenderAnnotation(
        enabledElement,
        svgDrawingHelper
      );
      const annotations = this._getAnnotations(enabledElement);
      const filteredToolAnnotations =
        this.filterInteractableAnnotationsForElement(
          enabledElement.viewport.element,
          annotations
        );
      const viewportAnnotation = filteredToolAnnotations[0];

      if (!viewportAnnotation?.annotationUID) {
        return renderStatus;
      }

      const annotationUID = viewportAnnotation.annotationUID;
      const crosshairCenterCanvas =
        enabledElement.viewport.worldToCanvas(this.toolCenter);
      const centerColor =
        this.configuration.getReferenceLineColor?.(enabledElement.viewport.id) ||
        "rgb(200, 200, 200)";

      (cornerstoneTools as any).drawing.drawCircle(
        svgDrawingHelper,
        annotationUID,
        "crosshair-center-point",
        crosshairCenterCanvas,
        4,
        {
          color: centerColor,
          fill: centerColor,
          lineWidth: 1.5,
        }
      );

      return renderStatus;
    };
  }
}

class NuCadBrushTool extends BrushTool {
  static toolName = BrushTool.toolName;

  constructor(...args: any[]) {
    super(...args);

    this.configuration.brushSize = 8;
    this.configuration.brushShape = "circle";
    (this as any).brushShape = "circle";
    this.configuration.strategies[SQUARE_BRUSH_FILL_STRATEGY] =
      fillInsideRectangle;
    this.configuration.strategies[SQUARE_BRUSH_ERASE_STRATEGY] =
      eraseInsideRectangle;

    const originalCalculateCursor = (this as any)._calculateCursor.bind(this);
    const originalRenderAnnotation = this.renderAnnotation.bind(this);
    const originalPreMouseDownCallback = this.preMouseDownCallback?.bind(this);
    const originalDragCallback = (this as any)._dragCallback?.bind(this);
    const originalEndCallback = (this as any)._endCallback?.bind(this);
    let lastDragTime = 0;
    let hasDrawnDuringDrag = false;
    let pendingDragEvent: any = null;

    (this as any)._calculateCursor = (
      element: HTMLDivElement,
      centerCanvas: [number, number]
    ) => {
      if ((this as any).brushShape !== "square") {
        return originalCalculateCursor(element, centerCanvas);
      }

      const enabledElement = getEnabledElement(element);
      const { viewport } = enabledElement;
      const { canvasToWorld } = viewport;
      const { brushSize } = this.configuration;
      const halfSide = brushSize / Math.sqrt(2);
      const topLeftCanvas = [
        centerCanvas[0] - halfSide,
        centerCanvas[1] - halfSide,
      ] as [number, number];
      const topRightCanvas = [
        centerCanvas[0] + halfSide,
        centerCanvas[1] - halfSide,
      ] as [number, number];
      const bottomRightCanvas = [
        centerCanvas[0] + halfSide,
        centerCanvas[1] + halfSide,
      ] as [number, number];
      const bottomLeftCanvas = [
        centerCanvas[0] - halfSide,
        centerCanvas[1] + halfSide,
      ] as [number, number];
      const { brushCursor } = (this as any)._hoverData;
      const { data } = brushCursor;

      if (data.handles === undefined) {
        data.handles = {};
      }

      data.handles.points = [
        canvasToWorld(topLeftCanvas),
        canvasToWorld(topRightCanvas),
        canvasToWorld(bottomRightCanvas),
        canvasToWorld(bottomLeftCanvas),
      ];
      data.invalidated = false;
    };

    this.renderAnnotation = (enabledElement: any, svgDrawingHelper: any) => {
      if ((this as any).brushShape !== "square") {
        return originalRenderAnnotation(enabledElement, svgDrawingHelper);
      }

      const hoverData = (this as any)._hoverData;

      if (!hoverData) {
        return;
      }

      const { viewport } = enabledElement;
      const viewportIdsToRender = hoverData.viewportIdsToRender;

      if (!viewportIdsToRender.includes(viewport.id)) {
        return;
      }

      const brushCursor = hoverData.brushCursor;

      if (brushCursor.data.invalidated === true) {
        const { centerCanvas } = hoverData;
        const { element } = viewport;
        (this as any)._calculateCursor(element, centerCanvas);
      }

      const toolMetadata = brushCursor.metadata;
      const annotationUID = toolMetadata.brushCursorUID;
      const data = brushCursor.data;
      const { points } = data.handles;
      const canvasCoordinates = points.map((point: any) =>
        viewport.worldToCanvas(point)
      );
      const xs = canvasCoordinates.map((point: [number, number]) => point[0]);
      const ys = canvasCoordinates.map((point: [number, number]) => point[1]);
      const topLeft = [Math.min(...xs), Math.min(...ys)] as [number, number];
      const bottomRight = [Math.max(...xs), Math.max(...ys)] as [number, number];
      const color = `rgb(${toolMetadata.segmentColor.slice(0, 3)})`;

      if (!viewport.getRenderingEngine()) {
        console.warn("Rendering Engine has been destroyed");
        return;
      }

      (cornerstoneTools as any).drawing.drawRect(
        svgDrawingHelper,
        annotationUID,
        "square-brush",
        topLeft,
        bottomRight,
        { color }
      );
    };

    if (originalPreMouseDownCallback) {
      this.preMouseDownCallback = (evt: any): boolean => {
        lastDragTime = 0;
        hasDrawnDuringDrag = false;
        pendingDragEvent = null;
        return originalPreMouseDownCallback(evt);
      };
    }

    if (originalDragCallback) {
      (this as any)._dragCallback = (evt: any): void => {
        const now = performance.now();

        if (hasDrawnDuringDrag && now - lastDragTime < 32) {
          pendingDragEvent = evt;
          return;
        }

        lastDragTime = now;
        hasDrawnDuringDrag = true;
        pendingDragEvent = null;
        originalDragCallback(evt);
      };
    }

    if (originalEndCallback) {
      (this as any)._endCallback = (evt: any): void => {
        if (pendingDragEvent) {
          originalDragCallback(pendingDragEvent);
          pendingDragEvent = null;
        } else if (!hasDrawnDuringDrag) {
          originalDragCallback(evt);
        }

        originalEndCallback(evt);
        hasDrawnDuringDrag = false;
      };
    }
  }
}

cornerstoneTools.addTool(StackScrollMouseWheelTool);
cornerstoneTools.addTool(NuCadWindowLevelTool);
cornerstoneTools.addTool(NuCadZoomTool);
cornerstoneTools.addTool(PanTool);
cornerstoneTools.addTool(NuCadDragProbeTool);
cornerstoneTools.addTool(NuCadCrosshairsTool);
cornerstoneTools.addTool(NuCadBrushTool);
cornerstoneTools.addTool(SegmentationDisplayTool);

const VolumeToolGroupId = "VOLUMETOOLGROUP_ID";
const VolumeToolGroup = ToolGroupManager.createToolGroup(VolumeToolGroupId);

const viewportColors = {
  [viewportIds[0]]: "rgb(200, 0, 0)",
  [viewportIds[1]]: "rgb(200, 200, 0)",
  [viewportIds[2]]: "rgb(0, 200, 0)",
  [viewportIds[3]]: "rgb(200, 0, 0)",
};
const viewportReferenceLineControllable = [...crosshairReferenceViewportIds];
const viewportReferenceLineDraggableRotatable = [...crosshairReferenceViewportIds];
const viewportReferenceLineSlabThicknessControlsOn = [...crosshairReferenceViewportIds];
function getReferenceLineColor(viewportId: string) {
  return viewportColors[viewportId];
}
function getReferenceLineControllable(viewportId: string) {
  const index = viewportReferenceLineControllable.indexOf(viewportId);
  return index !== -1;
}
function getReferenceLineDraggableRotatable(viewportId: string) {
  const index = viewportReferenceLineDraggableRotatable.indexOf(viewportId);
  return index !== -1;
}
function getReferenceLineSlabThicknessControlsOn(viewportId: string) {
  const index =
    viewportReferenceLineSlabThicknessControlsOn.indexOf(viewportId);
  return index !== -1;
}

function setToolPassiveFun(ToolGroup: cornerstoneTools.Types.IToolGroup) {
  ToolGroup.setToolPassive(NuCadWindowLevelTool.toolName);
  ToolGroup.setToolPassive(NuCadZoomTool.toolName);
  ToolGroup.setToolPassive(PanTool.toolName);
  ToolGroup.setToolPassive(NuCadDragProbeTool.toolName);
  ToolGroup.setToolPassive(BrushTool.toolName);
}

VolumeToolGroup.addTool(StackScrollMouseWheelTool.toolName);
VolumeToolGroup.addTool(NuCadWindowLevelTool.toolName);
VolumeToolGroup.addTool(NuCadZoomTool.toolName);
VolumeToolGroup.addTool(PanTool.toolName);
VolumeToolGroup.addTool(NuCadDragProbeTool.toolName);
VolumeToolGroup.addTool(CrosshairsTool.toolName, {
  shadow: true,
  viewportIndicators: true,
  autoPan: {
    enabled: false,
    panSize: 10,
  },
  referenceLinesCenterGapRadius: 20,
  filterActorUIDsToSetSlabThickness: [],
  slabThicknessBlendMode: CoreEnums.BlendModes.MAXIMUM_INTENSITY_BLEND,
  mobile: {
    enabled: false,
    opacity: 0.8,
    handleRadius: 9,
  },
  getReferenceLineColor,
  getReferenceLineControllable,
  getReferenceLineDraggableRotatable,
  getReferenceLineSlabThicknessControlsOn,
});
VolumeToolGroup.addTool(BrushTool.toolName);
VolumeToolGroup.addTool(SegmentationDisplayTool.toolName);

VolumeToolGroup.setToolActive(StackScrollMouseWheelTool.toolName);
VolumeToolGroup.setToolEnabled(SegmentationDisplayTool.toolName);

setToolPassiveFun(VolumeToolGroup);

/**
 * 同步功能
 */
const in_out_cameraSynchronizerId = "IN_OUT_CAMERAPOSITION_SYNCHRONIZER_ID";
const in_out_VoiSynchronizerId = "IN_OUT_VOI_SYNCHRONIZER_ID";

const setUpCameraSynchronizers = (MPR: string) => {
  let volume_cameraSynchronizer = getSynchronizer(
    in_out_cameraSynchronizerId
  ) as cornerstoneTools.Synchronizer;
  if (!volume_cameraSynchronizer) {
    volume_cameraSynchronizer = createCameraPositionSynchronizer(
      in_out_cameraSynchronizerId
    );
  }
  volume_cameraSynchronizer.add({
    renderingEngineId: renderingEngineId,
    viewportId: viewportIds[3],
  });
  const targetViewportId =
    MPR === "AXIAL"
      ? viewportIds[0]
      : MPR === "CORONAL"
      ? viewportIds[1]
      : viewportIds[2];
  volume_cameraSynchronizer.add({
    renderingEngineId: renderingEngineId,
    viewportId: targetViewportId,
  });
};
const removeCameraSynchronizers = (MPR: string) => {
  const volume_cameraSynchronizer = getSynchronizer(
    in_out_cameraSynchronizerId
  );
  if (volume_cameraSynchronizer) {
    volume_cameraSynchronizer.remove({
      renderingEngineId: renderingEngineId,
      viewportId: viewportIds[3],
    });
    const targetViewportId =
      MPR === "AXIAL"
        ? viewportIds[0]
        : MPR === "CORONAL"
        ? viewportIds[1]
        : viewportIds[2];
    volume_cameraSynchronizer.remove({
      renderingEngineId: renderingEngineId,
      viewportId: targetViewportId,
    });
  }
};

const setUpVoiSynchronizers = () => {
  let in_out_VoiSynchronizer = getSynchronizer(
    in_out_VoiSynchronizerId
  ) as cornerstoneTools.Synchronizer;
  if (!in_out_VoiSynchronizer) {
    in_out_VoiSynchronizer = (createVOISynchronizer as any)(in_out_VoiSynchronizerId, {
      syncInvertState: true,
      syncColormap: true,
    });
  }
  viewportIds.forEach((viewportId) => {
    in_out_VoiSynchronizer.add({
      renderingEngineId: renderingEngineId,
      viewportId,
    });
  });
};
const removeVoiSynchronizers = () => {
  const in_out_VoiSynchronizer = getSynchronizer(in_out_VoiSynchronizerId);
  if (in_out_VoiSynchronizer) {
    viewportIds.forEach((viewportId) => {
      in_out_VoiSynchronizer.remove({
        renderingEngineId: renderingEngineId,
        viewportId,
      });
    });
  }
};

export {
  VolumeToolGroup,
  NuCadWindowLevelTool,
  NuCadZoomTool,
  NuCadDragProbeTool,
  SQUARE_BRUSH_FILL_STRATEGY,
  SQUARE_BRUSH_ERASE_STRATEGY,
  setUpCameraSynchronizers,
  removeCameraSynchronizers,
  setUpVoiSynchronizers,
  removeVoiSynchronizers,
  setToolPassiveFun,
};
