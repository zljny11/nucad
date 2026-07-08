import React, { useEffect, useRef, useState } from "react";
import PubSub from "pubsub-js";
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
import EditableLesionPanel from "./EditableLesionPanel";
import SeriesSelectorPanel from "./SeriesSelectorPanel";
import {
  LESION_EDIT_CLOSE_TOPIC,
  LESION_EDIT_TOGGLE_TOPIC,
} from "./functions/lesionEditEvents";
import "./index.less";

const ImgPage: React.FC = () => {
  const patientInfo = useAppSelector((state) => state.patient.patientInfo);
  const { seriesId, pflag } = patientInfo;
  const selectedLesions = useRef<string[]>([]);
  const volumeLoaded = useRef<boolean>(false);
  const [lesionEditPanelVisible, setLesionEditPanelVisible] = useState(false);

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

  useEffect(() => {
    const token = PubSub.subscribe(LESION_EDIT_TOGGLE_TOPIC, () => {
      setLesionEditPanelVisible((visible) => !visible);
    });
    const closeToken = PubSub.subscribe(LESION_EDIT_CLOSE_TOPIC, () => {
      setLesionEditPanelVisible(false);
    });

    return () => {
      PubSub.unsubscribe(token);
      PubSub.unsubscribe(closeToken);
    };
  }, []);

  return (
    <div className="ImgPage">
      <ImgPageContext.Provider value={{ selectedLesions, volumeLoaded }}>
        <ImgShowHeader pflag={pflag} mode="viewer" />
        <div
          className={
            lesionEditPanelVisible
              ? "imgShowBody withSeriesSelector withEditableLesions"
              : "imgShowBody withSeriesSelector"
          }
        >
          <SeriesSelectorPanel />
          <ImgShow volumeIds={volumeIds} />
          {lesionEditPanelVisible ? <EditableLesionPanel /> : null}
        </div>
        <Report />
      </ImgPageContext.Provider>
    </div>
  );
};

export default ImgPage;
