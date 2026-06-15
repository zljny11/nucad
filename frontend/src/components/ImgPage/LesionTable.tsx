import React, { useState, useEffect, useContext } from "react";
import { useAppDispatch, useAppSelector } from "../../redux/hooks";
import { updateSheets } from "../../redux/patientSlice";
import PubSub from "pubsub-js";
import ImgPageContext from "./functions/ImgPageContext";
import { Checkbox } from "antd";
import type { CheckboxChangeEvent } from "antd/es/checkbox";
import translateFocalAreas from "../../functions/translateFocalAreas";
import { safeWindowRequire } from "../../utils/electron";

const fs = safeWindowRequire ? safeWindowRequire("fs") : null;
const path = safeWindowRequire ? safeWindowRequire("path") : null;
const sep = path ? path.sep : "/"; // sep为分隔符 /或\\ ，它会根据系统自动改变，如此来实现兼容不同系统设备
const xlsx = safeWindowRequire ? safeWindowRequire("node-xlsx") : null;

const CheckboxGroup = Checkbox.Group;

const LesionTable: React.FC = () => {
  const dispatch = useAppDispatch();
  const patientInfo = useAppSelector((state) => state.patient.patientInfo);
  const { outputPath } = patientInfo;
  const sheets = useAppSelector((state) => state.patient.sheets);
  const checkboxGroupOptions = sheets[0].data.map((item: string[]) => {
    return item[1];
  });
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

  const csvPath = outputPath + sep + "out" + sep + "report.xlsx";
  // 获取病灶列表
  useEffect(() => {
    if (!fs || !xlsx) {
      return;
    }
    fs.open(csvPath, "r", (err: string) => {
      if (err) {
        console.log(err);
        return;
      }
      const tempSheets = xlsx.parse(csvPath);
      tempSheets[0].data.shift(); // 去除数组中没用的信息（第一个）
      dispatch(updateSheets(tempSheets));
    });
  }, [csvPath, dispatch]);

  const jumpFun = (imgIndexs_str: string, index: number) => {
    const imgIndexs = imgIndexs_str.match(/\d+(\.\d+)?/g).map((imgIndex) => {
      return Math.round(parseFloat(imgIndex));
    });
    PubSub.publish("imgJumpByIndex", imgIndexs);
    setLesion(index);
  };

  const CheckboxGroupOnChange = (list: string[]) => {
    setCheckedList(list);
    selectedLesions.current = list;
    setIndeterminate(
      !!list.length && list.length < checkboxGroupOptions.length
    );
    setCheckAll(list.length === checkboxGroupOptions.length);
  };

  const onCheckAllChange = (e: CheckboxChangeEvent) => {
    setCheckedList(e.target.checked ? checkboxGroupOptions : []);
    selectedLesions.current = e.target.checked ? checkboxGroupOptions : [];
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
        onChange={CheckboxGroupOnChange}
      />
      {sheets[0].data.map((data: string[], index: number) => {
        return (
          <div
            className="tableRow lesionItem"
            style={{ backgroundColor: lesion === index ? "#666" : "" }}
            key={data[0]}
            onClick={() => jumpFun(data[2], index)}
          >
            {data.map((content, i) =>
              i === 1 ? (
                <span key={i}></span>
              ) : i === 5 || i === 6 || i === 7 ? (
                <span key={i}>
                  {parseFloat(content).toFixed(2)}
                  {i === 5 ? "ml" : ""}
                </span>
              ) : i === 15 ? (
                <span key={i}>{translateFocalAreas(content)}</span>
              ) : null
            )}
          </div>
        );
      })}
    </div>
  );
};

export default LesionTable;
