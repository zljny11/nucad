import ptScalingMetaDataProvider from "./helpers/ptScalingMetaDataProvider";
import { calculateSUVScalingFactors } from "@cornerstonejs/calculate-suv";
import { safeWindowRequire } from "../../../utils/electron";
const fs = safeWindowRequire ? safeWindowRequire("fs") : null;
const path = safeWindowRequire ? safeWindowRequire("path") : null;
const sep = path ? path.sep : "/";
const dicomParser = require("dicom-parser");

const getSlicePosition = (dataSet: any) => {
  const imagePosition = dataSet.string("x00200032");
  const imageOrientation = dataSet.string("x00200037");

  if (!imagePosition || !imageOrientation) {
    return null;
  }

  const position = imagePosition.split("\\").map(Number);
  const orientation = imageOrientation.split("\\").map(Number);
  if (position.length < 3 || orientation.length < 6) {
    return null;
  }

  const row = orientation.slice(0, 3);
  const col = orientation.slice(3, 6);
  const normal = [
    row[1] * col[2] - row[2] * col[1],
    row[2] * col[0] - row[0] * col[2],
    row[0] * col[1] - row[1] * col[0],
  ];

  return position[0] * normal[0] + position[1] * normal[1] + position[2] * normal[2];
};

const loadImages = (pathFolder: string, flag: string) => {
  if (!fs || !path) {
    throw new Error('Local image loading requires the Electron desktop app.');
  }
  if (!fs.existsSync(pathFolder)) {
    throw new Error('Image folder does not exist: ' + pathFolder);
  }
  // 对应影像文件夹中的文件名
  let filespath = fs.readdirSync(pathFolder); // 读取目录下文件
  if (!filespath.length) {
    throw new Error('No DICOM files found in folder: ' + pathFolder);
  }
  let imageIds = [];
  const instances = [];

  for (let i = 0; i < filespath.length; i++) {
    const filePath = pathFolder + sep + filespath[i];
    try {
      const content = fs.readFileSync(filePath);
      const contentParsed = dicomParser.parseDicom(content);
      instances.push({
        filePath,
        dataSet: contentParsed,
        instanceNumber: Number(contentParsed.string("x00200013")),
        slicePosition: getSlicePosition(contentParsed),
      });
    } catch (error) {
      // Ignore non-DICOM sidecar files.
    }
  }

  if (!instances.length) {
    throw new Error('No readable DICOM files found in folder: ' + pathFolder);
  }

  instances.sort((a, b) => {
    if (a.slicePosition !== null && b.slicePosition !== null) {
      return a.slicePosition - b.slicePosition;
    }

    return a.instanceNumber - b.instanceNumber;
  });

  let temp_contentParsed = instances[0].dataSet;
  let modality = temp_contentParsed.string("x00080060");
  imageIds = instances.map((instance) => "wadouri:file:///" + instance.filePath);

  if (modality === "PT" && flag !== "PET_OUT") {
    const InstanceMetadataArray = [];
    imageIds.forEach((imageId) => {
      //const instanceMetadata = getPTImageIdInstanceMetadata(imageId);
      const correctedImage = temp_contentParsed.string("x00280051");
      const units = temp_contentParsed.string("x00541001");
      const radionuclideHalfLife =
        temp_contentParsed.elements.x00540016.items[0].dataSet.string(
          "x00181072"
        );
      const radionuclideTotalDose =
        temp_contentParsed.elements.x00540016.items[0].dataSet.string(
          "x00181074"
        );
      const decayCorrection = temp_contentParsed.string("x00541102");
      const patientWeight = temp_contentParsed.string("x00101030");
      const seriesDate = temp_contentParsed.string("x00080021");
      const seriesTime = temp_contentParsed.string("x00080031");
      const acquisitionDate = temp_contentParsed.string("x00080022");
      const acquisitionTime = temp_contentParsed.string("x00080032");
      const actualFrameDuration = temp_contentParsed.string("x00181242");
      const patientSex = temp_contentParsed.string("x00100040");
      const patientSize = temp_contentParsed.string("x00101020");
      const radiopharmaceuticalStartTime =
        temp_contentParsed.elements.x00540016.items[0].dataSet.string(
          "x00181072"
        );
      const instanceMetadata = {
        CorrectedImage: correctedImage,
        Units: units,
        RadionuclideHalfLife: radionuclideHalfLife,
        RadionuclideTotalDose: radionuclideTotalDose,
        DecayCorrection: decayCorrection,
        PatientWeight: patientWeight,
        SeriesDate: seriesDate,
        SeriesTime: seriesTime,
        AcquisitionDate: acquisitionDate,
        AcquisitionTime: acquisitionTime,
        ActualFrameDuration: actualFrameDuration,
        PatientSex: patientSex,
        PatientSize: patientSize,
        RadiopharmaceuticalStartTime: radiopharmaceuticalStartTime,
      };

      if (typeof instanceMetadata.CorrectedImage === "string") {
        instanceMetadata.CorrectedImage =
          instanceMetadata.CorrectedImage.split("\\");
      }

      if (instanceMetadata) {
        InstanceMetadataArray.push(instanceMetadata);
      }
    });
    if (InstanceMetadataArray.length) {
      const suvScalingFactors = calculateSUVScalingFactors(
        InstanceMetadataArray
      );
      InstanceMetadataArray.forEach((instanceMetadata, index) => {
        ptScalingMetaDataProvider.addInstance(
          imageIds[index],
          suvScalingFactors[index]
        );
      });
    }
  }
  return imageIds;
};

export default loadImages;
