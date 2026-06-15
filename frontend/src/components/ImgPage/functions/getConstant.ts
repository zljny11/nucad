const renderingEngineId = "NuCAD_RenderingEngine";
const viewportIds = ["PET_AXIAL", "PET_CORONAL", "PET_SAGITTAL", "PET_CT"];

const volumeLoaderScheme = "cornerstoneStreamingImageVolume"; // Loader id which defines which volume loader to use
const petInVolumeName = "PET_IN_VOLUME_ID";
const petInVolumeId = `${volumeLoaderScheme}:${petInVolumeName}`; // VolumeId with loader id + volume id
const petOutVolumeName = "PET_OUT_VOLUME_ID";
const petOutVolumeId = `${volumeLoaderScheme}:${petOutVolumeName}`;
const ctVolumeName = "CT_VOLUME_ID";
const ctVolumeId = `${volumeLoaderScheme}:${ctVolumeName}`;

export {
  renderingEngineId,
  viewportIds,
  petInVolumeId,
  petOutVolumeId,
  ctVolumeId,
};
