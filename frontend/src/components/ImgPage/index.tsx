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
import LesionTable from "./LesionTable";
import ErrorReport from "./ErrorReport";
import Report from "./Report";
import "./index.less";

const ImgPage: React.FC = () => {
  const patientInfo = useAppSelector((state) => state.patient.patientInfo);
  const { seriesId, pflag } = patientInfo;
  const selectedLesions = useRef<string[]>([]);
  const volumeLoaded = useRef<boolean>(false);

  let volumeIds = null;
  if (pflag === "2" || pflag === "6") {
    volumeIds = [petInVolumeId + seriesId, ctVolumeId + seriesId];
  } else {
    volumeIds = [
      petInVolumeId + seriesId,
      petOutVolumeId + seriesId,
      ctVolumeId + seriesId,
    ];
  }

  return (
    <div className="ImgPage">
      <ImgPageContext.Provider value={{ selectedLesions, volumeLoaded }}>
        <ImgShowHeader pflag={pflag} />
        <div className="imgShowBody">
          <ImgShow volumeIds={volumeIds} />
          {pflag === "1" ? <LesionTable /> : pflag === "6" ? null : <ErrorReport />}
        </div>
        <Report />
      </ImgPageContext.Provider>
    </div>
  );
};

export default ImgPage;
