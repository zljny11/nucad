import React, { Fragment, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { useAppSelector, useAppDispatch } from "../../redux/hooks";
import type { AppDispatch } from "../../redux/store";
import {
  prePage,
  nextPage,
  toFirstPage,
  toLastPage,
} from "../../redux/ListPageSlice";
import { updatePatientInfo } from "../../redux/patientSlice";
import {
  listPatientGroup,
  listSeriesItem,
  patientState,
} from "../../types";

const product = "NNUNET";
const refreshTime = 2000;
let totalPage = 1;

const normalizeSeriesItem = (item: any): listSeriesItem => {
  const pname = item.pname || item.name || "匿名";
  const patientKey = String(item.pID || pname || "anonymous");
  const studyDate = item.studyDate || item.scanTime || "";

  return {
    seriesId: item.seriesId || "",
    pname,
    pID: item.pID || "",
    sex: item.sex || "",
    birthday: item.birthday || "",
    scanMode: item.scanMode || "",
    scanTime: item.scanTime || "",
    modifiedTime: item.modifiedTime || "",
    inputPath: item.inputPath || "",
    outputPath: item.outputPath || "",
    pflag: item.pflag || item.flag || "",
    seriesDesc: item.seriesDesc || "",
    studyKey: item.studyKey || `${patientKey}_${studyDate || "unknown"}`,
    studyLabel: item.studyLabel || studyDate || "未知检查",
    studyDate,
  };
};

const buildPatientTreeFromFlatList = (items: any[]): listPatientGroup[] => {
  const patientMap = new Map<string, listPatientGroup>();

  items.map(normalizeSeriesItem).forEach((series) => {
    const patientKey = String(series.pID || series.pname || "anonymous");
    let patient = patientMap.get(patientKey);

    if (!patient) {
      patient = {
        patientKey,
        pname: series.pname || "匿名",
        pID: series.pID || "",
        sex: series.sex || "",
        birthday: series.birthday || "",
        studyCount: 0,
        seriesCount: 0,
        studies: [],
      };
      patientMap.set(patientKey, patient);
    }

    let study = patient.studies.find((item) => item.studyKey === series.studyKey);
    if (!study) {
      study = {
        studyKey: series.studyKey,
        studyLabel: series.studyLabel,
        studyDate: series.studyDate,
        seriesCount: 0,
        seriesList: [],
      };
      patient.studies.push(study);
    }

    study.seriesList.push(series);
    study.seriesCount += 1;
    patient.seriesCount += 1;
  });

  return Array.from(patientMap.values()).map((patient) => ({
    ...patient,
    studyCount: patient.studies.length,
  }));
};

const normalizePatientGroups = (payload: any): listPatientGroup[] => {
  if (!Array.isArray(payload)) {
    return [];
  }

  if (!payload.length) {
    return [];
  }

  const firstItem = payload[0];
  if (firstItem && Array.isArray(firstItem.studies)) {
    return payload.map((patient) => ({
      patientKey: patient.patientKey || String(patient.pID || patient.pname || "anonymous"),
      pname: patient.pname || "匿名",
      pID: patient.pID || "",
      sex: patient.sex || "",
      birthday: patient.birthday || "",
      studyCount: Number(patient.studyCount || (Array.isArray(patient.studies) ? patient.studies.length : 0)),
      seriesCount: Number(patient.seriesCount || 0),
      studies: (patient.studies || []).map((study: any) => ({
        studyKey: study.studyKey || "unknown",
        studyLabel: study.studyLabel || study.studyDate || "未知检查",
        studyDate: study.studyDate || "",
        seriesCount: Number(study.seriesCount || (Array.isArray(study.seriesList) ? study.seriesList.length : 0)),
        seriesList: Array.isArray(study.seriesList)
          ? study.seriesList.map(normalizeSeriesItem)
          : [],
      })),
    }));
  }

  return buildPatientTreeFromFlatList(payload);
};

const getNewList = (
  curPage: number,
  sizePerPage: number,
  searchName: string,
  dispatch: AppDispatch,
  setList: React.Dispatch<React.SetStateAction<listPatientGroup[]>>
) => {
  axios
    .post("http://localhost:4001/list", {
      product,
      curPage,
      sizePerPage,
      searchName,
    })
    .then((result) => {
      totalPage =
        result.data[1] !== 0 ? Math.ceil(result.data[1] / sizePerPage) : 1;
      if (curPage > totalPage) {
        dispatch(toFirstPage());
      }
      setList(normalizePatientGroups(result.data[0]));
    });
};

const deleteRecord = (
  seriesId: string,
  curPage: number,
  sizePerPage: number,
  searchName: string,
  dispatch: AppDispatch,
  setList: React.Dispatch<React.SetStateAction<listPatientGroup[]>>
) => {
  if (window.confirm("确认删除?")) {
    axios
      .post("http://localhost:4001/del", { seriesId })
      .then((result) => {
        alert(result.data.success || "删除完成");
        getNewList(curPage, sizePerPage, searchName, dispatch, setList);
      })
      .catch((err) => {
        console.log(err);
        const message =
          err.response && err.response.data && err.response.data.error
            ? err.response.data.error
            : "删除失败";
        alert(message);
      });
  }
};

const truncateText = (value: string, maxLength: number) => {
  if (!value) {
    return "-";
  }

  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
};

const Listbody: React.FC = () => {
  const navigate = useNavigate();
  const curPage = useAppSelector((state) => state.ListPage.curPage);
  const searchName = useAppSelector((state) => state.ListPage.searchName);
  const dispatch = useAppDispatch();
  const [displayList, setList] = useState<listPatientGroup[]>([]);
  const [expandedPatients, setExpandedPatients] = useState<Record<string, boolean>>(
    {}
  );
  const [expandedStudies, setExpandedStudies] = useState<Record<string, boolean>>(
    {}
  );
  const sizePerPage = window.innerHeight >= 950 ? 12 : 10;

  useEffect(() => {
    getNewList(curPage, sizePerPage, searchName, dispatch, setList);
  }, [curPage, searchName, dispatch, sizePerPage]);

  useEffect(() => {
    const timer = setInterval(() => {
      getNewList(curPage, sizePerPage, searchName, dispatch, setList);
    }, refreshTime);

    return () => {
      clearInterval(timer);
    };
  }, [curPage, searchName, dispatch, sizePerPage]);

  useEffect(() => {
    if (!searchName) {
      return;
    }

    const nextExpandedPatients: Record<string, boolean> = {};
    const nextExpandedStudies: Record<string, boolean> = {};

    displayList.forEach((patient) => {
      nextExpandedPatients[patient.patientKey] = true;
      (patient.studies || []).forEach((study) => {
        nextExpandedStudies[study.studyKey] = true;
      });
    });

    setExpandedPatients(nextExpandedPatients);
    setExpandedStudies(nextExpandedStudies);
  }, [displayList, searchName]);

  const imgBtn = (patientInfo: patientState["patientInfo"]) => {
    const { pflag } = patientInfo;
    if (pflag === "1" || pflag === "2" || pflag === "6") {
      dispatch(updatePatientInfo(patientInfo));
      navigate("/ImgPage");
    } else if (pflag === "0" || pflag === "4" || pflag === "5") {
      alert("图像增强未完成，请稍后查看");
    } else if (pflag === "3") {
      alert(patientInfo.modifiedTime);
    } else {
      alert("请检查序列名是否添加或者config是否正确配置");
    }
  };

  const togglePatient = (patientKey: string) => {
    setExpandedPatients((current) => ({
      ...current,
      [patientKey]: !current[patientKey],
    }));
  };

  const toggleStudy = (studyKey: string) => {
    setExpandedStudies((current) => ({
      ...current,
      [studyKey]: !current[studyKey],
    }));
  };

  const renderSeriesRow = (series: listSeriesItem) => (
    <div className="treeRow seriesRow" key={series.seriesId}>
      <div className="treeCell descCell DropdownContainer">
        <span>{truncateText(series.seriesDesc, window.innerWidth >= 1400 ? 28 : 16)}</span>
        {series.seriesDesc ? <div className="dropdown">{series.seriesDesc}</div> : null}
      </div>
      <div className="treeCell noCell DropdownContainer">
        <span>{truncateText(series.seriesId, window.innerWidth >= 1400 ? 18 : 8)}</span>
        <div className="dropdown">{series.seriesId}</div>
      </div>
      <div className="treeCell modeCell">{series.scanMode || "-"}</div>
      <div className="treeCell studyCell">{series.scanTime || series.studyLabel}</div>
      <div className="treeCell operationCell">
        <button className="listBtn" onClick={() => imgBtn(series)}>
          查看
        </button>
        <button
          className="listBtn"
          onClick={() =>
            deleteRecord(
              series.seriesId,
              curPage,
              sizePerPage,
              searchName,
              dispatch,
              setList
            )
          }
        >
          删除
        </button>
      </div>
    </div>
  );

  return (
    <Fragment>
      <div className="bodyBox">
        <div className="treeHeader">
          <div className="treeCell patientCell">患者</div>
          <div className="treeCell metaCell">患者ID</div>
          <div className="treeCell metaCell">性别</div>
          <div className="treeCell metaCell">生日</div>
          <div className="treeCell countCell">检查数</div>
          <div className="treeCell countCell">序列数</div>
        </div>
        {displayList.length ? (
          displayList.map((patient) => {
            const patientExpanded = !!expandedPatients[patient.patientKey];

            return (
              <div className="treeGroup" key={patient.patientKey}>
                <button
                  className="treeRow patientRow"
                  onClick={() => togglePatient(patient.patientKey)}
                  type="button"
                >
                  <div className="treeCell patientCell">
                    <span className="treeArrow">{patientExpanded ? "▾" : "▸"}</span>
                    <span className="treeTitle">{patient.pname || "匿名"}</span>
                  </div>
                  <div className="treeCell metaCell">{patient.pID || "-"}</div>
                  <div className="treeCell metaCell">{patient.sex || "-"}</div>
                  <div className="treeCell metaCell">{patient.birthday || "-"}</div>
                  <div className="treeCell countCell">{patient.studyCount}</div>
                  <div className="treeCell countCell">{patient.seriesCount}</div>
                </button>

                {patientExpanded
                  ? (patient.studies || []).map((study) => {
                      const studyExpanded = !!expandedStudies[study.studyKey];

                      return (
                        <div className="studyBlock" key={study.studyKey}>
                          <button
                            className="treeRow studyRow"
                            onClick={() => toggleStudy(study.studyKey)}
                            type="button"
                          >
                            <div className="treeCell studyTitleCell">
                              <span className="treeArrow">
                                {studyExpanded ? "▾" : "▸"}
                              </span>
                              <span className="treeTitle">检查</span>
                            </div>
                            <div className="treeCell studyInfoCell">
                              <span className="studyLabel">study</span>
                              <span>{study.studyLabel || "未知检查"}</span>
                            </div>
                            <div className="treeCell studyInfoCell">
                              <span className="studyLabel">检查时间</span>
                              <span>{study.studyDate || "-"}</span>
                            </div>
                            <div className="treeCell studyCountCell">
                              <span className="studyLabel">序列数</span>
                              <span>{study.seriesCount}</span>
                            </div>
                          </button>

                          {studyExpanded ? (
                            <div className="seriesSection">
                              <div className="treeRow seriesHeader">
                                <div className="treeCell descCell">序列描述</div>
                                <div className="treeCell noCell">序号</div>
                                <div className="treeCell modeCell">扫描模态</div>
                                <div className="treeCell studyCell">检查时间/检查</div>
                                <div className="treeCell operationCell">操作</div>
                              </div>
                              {(study.seriesList || []).map(renderSeriesRow)}
                            </div>
                          ) : null}
                        </div>
                      );
                    })
                  : null}
              </div>
            );
          })
        ) : (
          <div className="emptyState">暂无符合条件的检查数据</div>
        )}
      </div>
      <div className="pagination">
        <button
          className={curPage === 1 ? "disabledButton" : "pageButton"}
          onClick={() => dispatch(toFirstPage())}
        >
          首页
        </button>
        <button
          className={curPage <= 1 ? "disabledButton" : "pageButton"}
          onClick={() => dispatch(prePage())}
        >
          上一页
        </button>
        <span className="pageInfo">
          {curPage}/{totalPage}
        </span>
        <button
          className={curPage === totalPage ? "disabledButton" : "pageButton"}
          onClick={() => dispatch(nextPage(totalPage))}
        >
          下一页
        </button>
        <button
          className={curPage === totalPage ? "disabledButton" : "pageButton"}
          onClick={() => dispatch(toLastPage(totalPage))}
        >
          尾页
        </button>
      </div>
    </Fragment>
  );
};

export default Listbody;
