import {
  Enums as CoreEnums,
  getEnabledElementByIds,
} from "@cornerstonejs/core";
import * as cornerstoneTools from "@cornerstonejs/tools";
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

    this.mouseMoveCallback = (evt: any, filteredToolAnnotations: any[] = []): boolean => {
      if (!originalMouseMoveCallback || !filteredToolAnnotations.length) {
        return false;
      }

      return originalMouseMoveCallback(evt, filteredToolAnnotations);
    };

    this.computeToolCenter = (viewportsInfo: any[]): void => {
      originalComputeToolCenter(viewportsInfo);

      if (viewportsInfo.length <= 3) {
        return;
      }

      viewportsInfo.slice(3).forEach((viewportInfo) => {
        this.initializeViewport(viewportInfo);
      });

      const enabledElement = getEnabledElementByIds(
        viewportsInfo[0].viewportId,
        viewportsInfo[0].renderingEngineId
      );
      enabledElement?.renderingEngine.render();
    };
  }
}

cornerstoneTools.addTool(StackScrollMouseWheelTool);
cornerstoneTools.addTool(WindowLevelTool);
cornerstoneTools.addTool(NuCadZoomTool);
cornerstoneTools.addTool(PanTool);
cornerstoneTools.addTool(NuCadDragProbeTool);
cornerstoneTools.addTool(NuCadCrosshairsTool);
cornerstoneTools.addTool(BrushTool);
cornerstoneTools.addTool(SegmentationDisplayTool);

const VolumeToolGroupId = "VOLUMETOOLGROUP_ID";
const VolumeToolGroup = ToolGroupManager.createToolGroup(VolumeToolGroupId);

const viewportColors = {
  [viewportIds[0]]: "rgb(200, 0, 0)",
  [viewportIds[1]]: "rgb(200, 200, 0)",
  [viewportIds[2]]: "rgb(0, 200, 0)",
  [viewportIds[3]]: "rgb(200, 0, 0)",
};
const viewportReferenceLineControllable = [
  viewportIds[0],
  viewportIds[1],
  viewportIds[2],
  viewportIds[3],
];
const viewportReferenceLineDraggableRotatable = [
  viewportIds[0],
  viewportIds[1],
  viewportIds[2],
  viewportIds[3],
];
const viewportReferenceLineSlabThicknessControlsOn = [
  viewportIds[0],
  viewportIds[1],
  viewportIds[2],
  viewportIds[3],
];
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
  ToolGroup.setToolPassive(WindowLevelTool.toolName);
  ToolGroup.setToolPassive(NuCadZoomTool.toolName);
  ToolGroup.setToolPassive(PanTool.toolName);
  ToolGroup.setToolPassive(NuCadDragProbeTool.toolName);
  ToolGroup.setToolPassive(BrushTool.toolName);
}

VolumeToolGroup.addTool(StackScrollMouseWheelTool.toolName);
VolumeToolGroup.addTool(WindowLevelTool.toolName);
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
    in_out_VoiSynchronizer = createVOISynchronizer(in_out_VoiSynchronizerId, {
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
  NuCadZoomTool,
  NuCadDragProbeTool,
  setUpCameraSynchronizers,
  removeCameraSynchronizers,
  setUpVoiSynchronizers,
  removeVoiSynchronizers,
  setToolPassiveFun,
};
