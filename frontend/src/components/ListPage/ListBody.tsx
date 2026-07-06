import React, { useState, useEffect, Fragment } from "react";
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
import { patientState } from "../../types";

interface display_listType {
  seriesId: string;
  pname: string;
  pID: string;
  sex: string;
  birthday: string;
  scanMode: string;
  scanTime: string;
  inputPath: string;
  outputPath: string;
  modifiedTime: string;
  pflag: string;
  seriesDesc: string;
}

const product = "NNUNET";
const refreshTime = 2000;
let totalPage = 1;

const getNewList = (
  curPage: number,
  sizePerPage: number,
  searchName: string,
  dispatch: AppDispatch,
  setList: React.Dispatch<React.SetStateAction<display_listType[]>>
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
      setList(result.data[0]);
    });
};

const deleteRecord = (
  seriesId: string,
  curPage: number,
  sizePerPage: number,
  searchName: string,
  dispatch: AppDispatch,
  setList: React.Dispatch<React.SetStateAction<display_listType[]>>
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
        const message = err.response && err.response.data && err.response.data.error
          ? err.response.data.error
          : "删除失败";
        alert(message);
      });
  }
};

const Listbody: React.FC = () => {
  const navigate = useNavigate();
  const curPage = useAppSelector((state) => state.ListPage.curPage);
  const searchName = useAppSelector((state) => state.ListPage.searchName);
  const dispatch = useAppDispatch();
  const [display_list, setList] = useState<display_listType[]>([]); //display_list 为数据
  const sizePerPage = window.innerHeight >= 950 ? 12 : 10;

  useEffect(() => {
    // 监控页码刷新列表
    getNewList(curPage, sizePerPage, searchName, dispatch, setList);
  }, [curPage, searchName, dispatch, sizePerPage]);

  useEffect(() => {
    // 定时刷新
    const timer = setInterval(() => {
      getNewList(curPage, sizePerPage, searchName, dispatch, setList);
    }, refreshTime);
    return () => {
      clearInterval(timer);
    };
  });

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

  return (
    <Fragment>
      <div className="bodyBox">
        <div className="listRow listRow1">
          <div className="desc">序列描述</div>
          <div className="no">序号</div>
          <div className="name"> 姓名</div>
          <div className="sex">性别</div>
          <div className="birthday">生日</div>
          <div className="mode">扫描模态</div>
          <div className="processTime">扫描时间</div>
          <div className="modifineTime">处理时间</div>
          <div className="operation">操作</div>
        </div>
        {display_list.length
          ? display_list.map((obj) => {
              return (
                <div className="listRow" key={obj.seriesId}>
                  {window.innerWidth >= 1400 ? (
                    obj.seriesDesc && obj.seriesDesc.length >= 20 ? (
                      <div className="desc DropdownContainer">
                        <span>{obj.seriesDesc.slice(0, 20) + "..."}</span>{" "}
                        <div className="dropdown">{obj.seriesDesc}</div>
                      </div>
                    ) : (
                      <div className="desc">{obj.seriesDesc}</div>
                    )
                  ) : obj.seriesDesc && obj.seriesDesc.length >= 10 ? (
                    <div className="desc DropdownContainer">
                      <span>{obj.seriesDesc.slice(0, 10) + "..."}</span>{" "}
                      <div className="dropdown">{obj.seriesDesc}</div>
                    </div>
                  ) : (
                    <div className="desc">{obj.seriesDesc}</div>
                  )}
                  {window.innerWidth <= 1400 &&
                  obj.seriesId &&
                  obj.seriesId.length >= 5 ? (
                    <div className="no DropdownContainer">
                      <span>{obj.seriesId.slice(0, 5) + "..."}</span>
                      <div className="dropdown">{obj.seriesId}</div>
                    </div>
                  ) : obj.seriesId && obj.seriesId.length > 16 ? (
                    <div className="no DropdownContainer">
                      <span>{obj.seriesId.slice(0, 16) + "..."}</span>
                      <div className="dropdown">{obj.seriesId}</div>
                    </div>
                  ) : (
                    <div className="no">{obj.seriesId}</div>
                  )}
                  {obj.pname && obj.pname.length > 10 ? (
                    <div className="name DropdownContainer">
                      <span>{obj.pname.slice(0, 10) + "..."}</span>
                      <div className="dropdown">{obj.pname}</div>
                    </div>
                  ) : (
                    <div className="name">{obj.pname} </div>
                  )}
                  <div className="sex">{obj.sex}</div>
                  <div className="birthday">{obj.birthday}</div>
                  <div className="mode">{obj.scanMode}</div>
                  <div className="processTime">{obj.scanTime}</div>
                  {obj.modifiedTime &&
                  obj.modifiedTime.length > 10 &&
                  window.innerWidth <= 1400 ? (
                    <div className="modifineTime DropdownContainer">
                      <span>{obj.modifiedTime.slice(0, 10)}</span>
                      <div className="dropdown">{obj.modifiedTime}</div>
                    </div>
                  ) : (
                    <div className="modifineTime">{obj.modifiedTime}</div>
                  )}
                  <div className="operation">
                    <button className="listBtn" onClick={() => imgBtn(obj)}>
                      查看
                    </button>
                    <button
                      className="listBtn"
                      onClick={() =>
                        deleteRecord(
                          obj.seriesId,
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
            })
          : null}
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
