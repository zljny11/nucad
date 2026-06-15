import React, { Fragment, useState, useEffect } from "react";
import { useAppSelector } from "../../../redux/hooks";
import PubSub from "pubsub-js";
import Report1 from "./Report1";
import Report2 from "./Report2";
import Report3 from "./Report3";
import Report4 from "./Report4";
import download from "./functions/generateReport";
import translateFocalAreas from "../../../functions/translateFocalAreas";
import Logo from "../../../images/logonamegrey.png";
import "./index.less";

const downloadReport = (seriesId: string) => {
  const report = document.getElementById("report");
  download(report, seriesId);
};

const Report: React.FC = () => {
  const patientInfo = useAppSelector((state) => state.patient.patientInfo);
  const { seriesId } = patientInfo;
  const [showReport, setShowReport] = useState(false);
  const [reportMargin, setReportMargin] = useState(true);

  useEffect(() => {
    PubSub.subscribe("showReport", () => {
      setShowReport(true);
    });
    return () => {
      PubSub.unsubscribe("showReport");
    };
  }, []);

  useEffect(() => {
    if (!reportMargin) {
      console.log("我执行了");
      downloadReport(seriesId);
      setReportMargin(true);
    }
  }, [reportMargin]);

  return (
    <div className="Report" style={{ display: showReport ? "" : "none" }}>
      <div className="reportViewport">
        <div className="reportHead">
          <img className="logo" src={Logo} alt="Logo" />
          <div className="reportTitle">检查报告</div>
          <div
            className="reportDownloadBtn"
            onClick={() => setReportMargin(false)}
          >
            <div className="NewIconfont"> &#xe6ad; 打印报告 </div>
          </div>
          <div onClick={() => setShowReport(false)} className="reportGoBackBtn">
            <div className="NewIconfont"> &#xe8a4; 返回 </div>
          </div>
          <hr
            style={{
              borderWidth: "2px",
              borderStyle: "solid",
              color: "#0e5d94",
              marginTop: 20,
              marginBottom: 0,
            }}
          />
        </div>

        <div
          className={reportMargin ? "report" : "report noMargin"}
          id="report"
        >
          <Report1 />
          <Report2 />
          <Report3 />
          <Report4 />
        </div>
      </div>
    </div>
  );
};

export default Report;
