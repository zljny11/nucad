import React, { useEffect, useRef, useState } from "react";
import { useAppSelector } from "../../redux/hooks";
import PubSub from "pubsub-js";
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
import LesionResultSync from "./LesionResultSync";
import {
  LESION_EDIT_CLOSE_TOPIC,
  LESION_EDIT_TOGGLE_TOPIC,
} from "./functions/lesionEditEvents";
import "./index.less";

const LesionEditPage: React.FC = () => {
  const patientInfo = useAppSelector((state) => state.patient.patientInfo);
  const { seriesId, pflag } = patientInfo;
  const [selectedLesionsState, setSelectedLesions] = useState<string[]>([]);
  const selectedLesions = useRef<string[]>(selectedLesionsState);
  const volumeLoaded = useRef<boolean>(false);
  const [lesionEditPanelVisible, setLesionEditPanelVisible] = useState(true);

  useEffect(() => {
    selectedLesions.current = selectedLesionsState;
  }, [selectedLesionsState]);

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
      <ImgPageContext.Provider
        value={{ selectedLesions, setSelectedLesions, volumeLoaded }}
      >
        <ImgShowHeader pflag={pflag} mode="editor" />
        <div
          className={
            lesionEditPanelVisible
              ? "imgShowBody withEditableLesions"
              : "imgShowBody"
          }
        >
          <ImgShow volumeIds={volumeIds} enableMaskEditing />
          {lesionEditPanelVisible ? <EditableLesionPanel /> : null}
        </div>
        <Report />
        <LesionResultSync />
      </ImgPageContext.Provider>
    </div>
  );
};

export default LesionEditPage;
