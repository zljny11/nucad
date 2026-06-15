import React, { useState, useEffect } from "react";
import { useAppSelector } from "../../redux/hooks";
import { safeWindowRequire } from "../../utils/electron";
// import Logo from "../../images/logonamegrey.png";

const fs = safeWindowRequire ? safeWindowRequire("fs") : null;

const ErrorReport: React.FC = () => {
  const patientInfo = useAppSelector((state) => state.patient.patientInfo);
  const { outputPath } = patientInfo;
  const [errLog, setErrLog] = useState({
    ErrorType: "",
    ReportTime: "",
    ReportTitle: "",
    ErrorInfo: "",
  });

  useEffect(() => {
    if (!fs) {
      return;
    }
    try {
      const data = fs.readFileSync(`${outputPath}/out/err_log.json`, "utf8");
      // parse JSON string to JSON object
      const err_log = JSON.parse(data);
      const { ErrorType, ReportTime, ReportTitle, ErrorInfo } = err_log;
      setErrLog({
        ErrorType,
        ReportTime,
        ReportTitle,
        ErrorInfo,
      });
    } catch (err) {
      console.log(`Error reading file from disk: ${err}`);
    }
  }, [outputPath]);

  return (
    <div className="ErrorReport">
      <div className="header">
        {/* <img src={Logo} alt="Logo" /> */}
        <div className="baseInfo">
          <div>
            <div className="baseInfoItem">Error Type:</div>
            {errLog.ErrorType}
          </div>
          <div>
            <div className="baseInfoItem">Report Time:</div>
            {errLog.ReportTime}
          </div>
        </div>
      </div>
      <div className="body">
        <div className="title">{errLog.ReportTitle}</div>
        <div className="context">
          {errLog.ErrorInfo.replace(/&quot;/g, '"').replace(/<br\/>/g, "\n")}
        </div>
      </div>
    </div>
  );
};

export default ErrorReport;
