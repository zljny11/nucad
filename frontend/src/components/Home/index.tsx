import React from "react";
import { useNavigate } from "react-router-dom";
import logo from "../../images/logonamegrey.png";
import logoOnly from "../../images/logo/logoonly.png";
import { getBypassedLicenseResult } from "../../utils/electron";
import "./index.less";

const Home: React.FC = () => {
  const navigate = useNavigate();
  const verifyResult = getBypassedLicenseResult();

  const toNextPage = (pageName) => {
    navigate(pageName, { state: { verifyResult } });
  };

  return (
    <div className="Home">
      <img src={logo} alt="logo" className="logo" />
      <div className="imgButton">
        <div className="menu">
          <button className="localBtn" onClick={() => toNextPage("/ListPage")}>
            NuCAD
          </button>
        </div>
        <div className="menu">
          <button
            className="licenseBtn"
            onClick={() => toNextPage("/LicensePage")}
          >
            证书信息
          </button>
        </div>
      </div>
      <img src={logoOnly} alt="logoOnly" className="logoOnly"></img>
      <div className="Title">欢迎使用影动医疗核医学辅助诊断系统</div>
    </div>
  );
};

export default Home;
