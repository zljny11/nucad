import React, { useState, useEffect, useContext, useRef } from "react";
import { useAppDispatch, useAppSelector } from "../../redux/hooks";
import { updateSheets } from "../../redux/patientSlice";
import PubSub from "pubsub-js";
import ImgPageContext from "./functions/ImgPageContext";
import { Checkbox } from "antd";
import type { CheckboxChangeEvent } from "antd/es/checkbox";
import translateFocalAreas from "../../functions/translateFocalAreas";
import { getEffectiveOutputPath } from "./functions/pathUtils";
import { loadCachedLesionSheet } from "./functions/lesionReportCache";

const CheckboxGroup = Checkbox.Group;

const getAreaText = (area: string) => {
  const translatedArea = translateFocalAreas(area);
  return translatedArea === "未识别" ? area : translatedArea;
};

const LesionTable: React.FC = () => {
  const dispatch = useAppDispatch();
  const patientInfo = useAppSelector((state) => state.patient.patientInfo);
  const { outputPath, inputPath } = patientInfo;
  const sheets = useAppSelector((state) => state.patient.sheets);
  const lesionRows = [...sheets[0].data, ...(sheets[0].doctorData || [])];
  const checkboxGroupOptions = lesionRows.map((item: string[]) => item[1]);
  const { selectedLesions } = useContext(ImgPageContext);
  const [lesion, setLesion] = useState(-1);
  const [checkedList, setCheckedList] = useState<string[]>(selectedLesions.current);
  const [indeterminate, setIndeterminate] = useState(
    !!selectedLesions.current.length &&
      selectedLesions.current.length < checkboxGroupOptions.length
  );
  const [checkAll, setCheckAll] = useState(
    selectedLesions.current.length === checkboxGroupOptions.length &&
      checkboxGroupOptions.length !== 0
  );
  const effectiveOutputPath = getEffectiveOutputPath(outputPath, inputPath);
  const loadedOutputPath = useRef("");

  useEffect(() => {
    if (!effectiveOutputPath || loadedOutputPath.current === effectiveOutputPath) {
      return;
    }

    loadedOutputPath.current = effectiveOutputPath;
    dispatch(updateSheets({ 0: loadCachedLesionSheet(effectiveOutputPath) }));
  }, [dispatch, effectiveOutputPath]);

  const jumpFun = (imgIndexsStr: string, index: number) => {
    const imgIndexs = imgIndexsStr.match(/\d+(\.\d+)?/g)?.map((imgIndex) => {
      return Math.round(parseFloat(imgIndex));
    });

    if (!imgIndexs?.length) {
      return;
    }

    PubSub.publish("imgJumpByIndex", imgIndexs);
    setLesion(index);
  };

  const checkboxGroupOnChange = (list: string[]) => {
    setCheckedList(list);
    selectedLesions.current = list;
    setIndeterminate(!!list.length && list.length < checkboxGroupOptions.length);
    setCheckAll(list.length === checkboxGroupOptions.length);
  };

  const onCheckAllChange = (e: CheckboxChangeEvent) => {
    const nextCheckedList = e.target.checked ? checkboxGroupOptions : [];
    setCheckedList(nextCheckedList);
    selectedLesions.current = nextCheckedList;
    setIndeterminate(false);
    setCheckAll(e.target.checked);
  };

  return (
    <div className="lesionTable">
      <div className="tableRow tableHead">
        <div className="prompt">可能存在的病灶</div>
      </div>
      <Checkbox
        className="selectAll"
        indeterminate={indeterminate}
        onChange={onCheckAllChange}
        checked={checkAll}
      >
        全选
      </Checkbox>
      <div className="tableRow">
        <span>序号</span>
        <span>体积</span>
        <span>
          SUV<span className="littleFont">Max</span>
        </span>
        <span>
          SUV<span className="littleFont">Mean</span>
        </span>
        <span>区域</span>
      </div>
      <CheckboxGroup
        className="CheckboxGroup"
        options={checkboxGroupOptions}
        value={checkedList}
        onChange={checkboxGroupOnChange}
      />
      {lesionRows.map((data: string[], index: number) => {
        const volume = Number.parseFloat(data[5] || "0");
        const suvMax = Number.parseFloat(data[6] || "0");
        const suvMean = Number.parseFloat(data[7] || "0");

        return (
          <div
            className="tableRow lesionItem"
            style={{ backgroundColor: lesion === index ? "#666" : "" }}
            key={`${data[0]}-${index}`}
            onClick={() => jumpFun(data[2], index)}
          >
            <span>{index + 1}</span>
            <span>{Number.isFinite(volume) ? volume.toFixed(2) : "-"}ml</span>
            <span>{Number.isFinite(suvMax) ? suvMax.toFixed(2) : "-"}</span>
            <span>{Number.isFinite(suvMean) ? suvMean.toFixed(2) : "-"}</span>
            <span>{getAreaText(data[14] || "")}</span>
          </div>
        );
      })}
    </div>
  );
};

export default LesionTable;
