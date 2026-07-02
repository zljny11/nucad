import ptScalingMetaDataProvider from "./helpers/ptScalingMetaDataProvider";
import { calculateSUVScalingFactors } from "@cornerstonejs/calculate-suv";
import { safeWindowRequire } from "../../../utils/electron";
const fs = safeWindowRequire ? safeWindowRequire("fs") : null;
const path = safeWindowRequire ? safeWindowRequire("path") : null;
const sep = path ? path.sep : "/";
const dicomParser = require("dicom-parser");

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
  let map = {};
  let arr = [];
  let imageIds = [];
  let temp_content = fs.readFileSync(pathFolder + sep + filespath[0]);
  let temp_contentParsed = dicomParser.parseDicom(temp_content);
  let modality = temp_contentParsed.string("x00080060");
  for (let i = 0; i < filespath.length; i++) {
    let content = fs.readFileSync(pathFolder + "/" + filespath[i]);
    let contentParsed = dicomParser.parseDicom(content);
    let instancenum = contentParsed.string("x00200013");
    map[instancenum] = i;
    arr[i] = instancenum;
  }
  arr.sort(function (a, b) {
    return a - b;
  });
  let arrp = [];
  for (let i = 0; i < arr.length; i++) {
    let k = arr[i];
    arrp[i] = "wadouri:file:///" + pathFolder + sep + filespath[map[k]];
    imageIds[i] = arrp[i];
  }
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
