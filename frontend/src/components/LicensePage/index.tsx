import React, { useState, Fragment } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { licenseRenew } from "./functions/licenseRenew";
import { licenseVerify } from "./functions/licenseVerify";
import Logo from "../../images/logonamegrey.png";
import {
  getBypassedLicenseResult,
  getElectronStore,
} from "../../utils/electron";
import "./index.less";

const store = getElectronStore();

interface LicensePageLocationStates {
  state: {
    verifyResult: [
      flag: boolean,
      mac: string,
      expireDate: string,
      usage: string,
      validProducts: string
    ];
  };
}

const LicensePage: React.FC = () => {
  const navigate = useNavigate();
  const GoBack = () => navigate(-1);
  const location = useLocation() as LicensePageLocationStates;
  const verifyResult =
    location.state?.verifyResult || getBypassedLicenseResult();
  const [attempts, setAttempts] = useState(store.get("attempts"));
  const [VerifyResult, setVerifyResult] = useState(verifyResult);
  let key = "";
  const keyChange = (e) => (key = e.target.value);
  let remainingDays = 0;

  if (VerifyResult[0]) {
    const expireDate = VerifyResult[2];
    const std_date =
      expireDate.substr(0, 4) +
      "-" +
      expireDate.substr(4, 2) +
      "-" +
      expireDate.substr(6, 2);
    const date_expire = new Date(std_date);
    const date_now = new Date();
    if (date_expire.getTime() >= date_now.getTime()) {
      const msecond =
        parseInt(date_expire.toString()) - parseInt(date_now.toString());
      remainingDays = Math.ceil(msecond / 86400000);
    }
  }
  const usage = VerifyResult[3];

  const submit = () => {
    if (key === "") {
      alert("请输入激活码以更新证书");
    } else if (attempts > 0) {
      setAttempts(licenseRenew(key));
      setVerifyResult(
        licenseVerify() as LicensePageLocationStates["state"]["verifyResult"]
      );
    } else {
      alert("您本月的尝试次数已用光，请联系软件制造商进行证书续费");
    }
  };

  return (
    <section className="w3l-coming-soon-block">
      <nav className="regularTitleContainer">
        <div className="navimg">
          <img src={Logo} className="logoHeader" alt="logo" />
        </div>
        <div onClick={GoBack} className="goButton">
          <div className="NewIconfont"> &#xe8a4; 返回 </div>
        </div>
      </nav>
      <div className="coming-section">
        <div className="wrapper">
          <main className="content">
            <div className="right">
              <h1>更新证书</h1>
              <div className="subscribe-form">
                <form action="#" method="GET">
                  <input
                    id="form-email"
                    name="form-email"
                    type="text"
                    className="license_input"
                    placeholder="输入激活码以增加使用期限或次数"
                    onChange={keyChange}
                  />
                  <button
                    type="button"
                    className="btn theme-submit-button"
                    onClick={submit}
                  >
                    提交
                  </button>
                  {attempts > 0 ? (
                    <div style={{ fontSize: 16 }}>
                      您本月还可尝试{attempts}次
                    </div>
                  ) : (
                    <div style={{ fontSize: 16 }}>您本月的尝试次数已用光</div>
                  )}
                </form>
              </div>
            </div>
            <div className="left">
              <div className="countdown">
                <div className="countdown__days">
                  {VerifyResult[0] ? (
                    <Fragment>
                      <div className="number">证书有效期剩余</div>
                      <span>{remainingDays}天</span>
                    </Fragment>
                  ) : (
                    <Fragment>
                      <div className="number">您的证书已过期</div>
                      <span>&nbsp;</span>
                    </Fragment>
                  )}
                </div>
                <div className="countdown__minutes">
                  <div className="number">使用次数剩余</div>
                  <span>{usage}次</span>
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    </section>
  );
};

export default LicensePage;
