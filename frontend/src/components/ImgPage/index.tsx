import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import SeriesSelectorPanel, { SelectedSeries } from "./SeriesSelectorPanel";
import {
  LESION_EDIT_CLOSE_TOPIC,
  LESION_EDIT_TOGGLE_TOPIC,
} from "./functions/lesionEditEvents";
import { SERIES_CHANGE_TOPIC } from "./functions/seriesEvents";
import "./index.less";

const ImgPage: React.FC = () => {
  const patientInfo = useAppSelector((state) => state.patient.patientInfo);
  const { seriesId, pflag } = patientInfo;
  const [selectedLesionsState, setSelectedLesions] = useState<string[]>([]);
  const selectedLesions = useRef<string[]>(selectedLesionsState);
  const volumeLoaded = useRef<boolean>(false);
  const [lesionEditPanelVisible, setLesionEditPanelVisible] = useState(false);
  const [selectedSeries, setSelectedSeries] = useState<SelectedSeries | null>(null);

  useEffect(() => {
    selectedLesions.current = selectedLesionsState;
  }, [selectedLesionsState]);

  const handleSeriesChange = useCallback((series: SelectedSeries) => {
    setSelectedSeries(series);
    PubSub.publish(SERIES_CHANGE_TOPIC, series);
  }, []);

  const volumeIds = useMemo(() => {
    const selectedSeriesSuffix = selectedSeries
      ? `:${selectedSeries.id}`
      : "";
    const volumeSeriesId = `${seriesId}${selectedSeriesSuffix}`;

    if (selectedSeries || pflag === "2" || pflag === "6") {
      return [petInVolumeId + volumeSeriesId, ctVolumeId + volumeSeriesId];
    }

    return [
      petInVolumeId + volumeSeriesId,
      petOutVolumeId + volumeSeriesId,
      ctVolumeId + volumeSeriesId,
    ];
  }, [pflag, selectedSeries, seriesId]);

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
      <ImgPageContext.Provider
        value={{ selectedLesions, setSelectedLesions, volumeLoaded }}
      >
        <ImgShowHeader pflag={pflag} mode="viewer" />
        <div
          className={
            lesionEditPanelVisible
              ? "imgShowBody withSeriesSelector withEditableLesions"
              : "imgShowBody withSeriesSelector"
          }
        >
          <SeriesSelectorPanel
            selectedSeriesId={selectedSeries?.id || ""}
            onSeriesChange={handleSeriesChange}
          />
          <ImgShow
            volumeIds={volumeIds}
            selectedSeries={selectedSeries}
            enableMaskEditing
          />
          {lesionEditPanelVisible ? <EditableLesionPanel /> : null}
        </div>
        <Report />
      </ImgPageContext.Provider>
    </div>
  );
};

export default ImgPage;
