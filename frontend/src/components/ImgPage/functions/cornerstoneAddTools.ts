import { Enums as CoreEnums } from "@cornerstonejs/core";
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

cornerstoneTools.addTool(StackScrollMouseWheelTool);
cornerstoneTools.addTool(WindowLevelTool);
cornerstoneTools.addTool(ZoomTool);
cornerstoneTools.addTool(PanTool);
cornerstoneTools.addTool(DragProbeTool);
cornerstoneTools.addTool(CrosshairsTool);
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
  ToolGroup.setToolPassive(ZoomTool.toolName);
  ToolGroup.setToolPassive(PanTool.toolName);
  ToolGroup.setToolPassive(DragProbeTool.toolName);
  ToolGroup.setToolPassive(BrushTool.toolName);
}

VolumeToolGroup.addTool(StackScrollMouseWheelTool.toolName);
VolumeToolGroup.addTool(WindowLevelTool.toolName);
VolumeToolGroup.addTool(ZoomTool.toolName);
VolumeToolGroup.addTool(PanTool.toolName);
VolumeToolGroup.addTool(DragProbeTool.toolName);
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
  setUpCameraSynchronizers,
  removeCameraSynchronizers,
  setUpVoiSynchronizers,
  removeVoiSynchronizers,
  setToolPassiveFun,
};
