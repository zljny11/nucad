import React, { useRef } from "react";
import { useAppSelector } from "../../redux/hooks";
import ImgPageContext from "./functions/ImgPageContext";
import {
  petInVolumeId,
  petOutVolumeId,
  ctVolumeId,
} from "./functions/getConstant";
import ImgShowHeader from "./ImgShowHeader";
import ImgShow from "./ImgShow";
import Report from "./Report";
import "./index.less";

const LesionEditPage: React.FC = () => {
  const patientInfo = useAppSelector((state) => state.patient.patientInfo);
  const { seriesId, pflag } = patientInfo;
  const selectedLesions = useRef<string[]>([]);
  const volumeLoaded = useRef<boolean>(false);

  const volumeIds =
    pflag === "2" || pflag === "6"
      ? [petInVolumeId + seriesId, ctVolumeId + seriesId]
      : [
          petInVolumeId + seriesId,
          petOutVolumeId + seriesId,
          ctVolumeId + seriesId,
        ];

  return (
    <div className="ImgPage lesionEditPage">
      <ImgPageContext.Provider value={{ selectedLesions, volumeLoaded }}>
        <ImgShowHeader pflag={pflag} mode="editor" />
        <div className="imgShowBody">
          <ImgShow volumeIds={volumeIds} enableMaskEditing />
        </div>
        <Report />
      </ImgPageContext.Provider>
    </div>
  );
};

export default LesionEditPage;
