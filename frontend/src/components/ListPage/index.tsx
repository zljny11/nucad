import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { useAppSelector, useAppDispatch } from "../../redux/hooks";
import { setSearchName } from "../../redux/ListPageSlice";
import { safeWindowRequire, getElectronStore } from "../../utils/electron";
import ListBody from "./ListBody";
import logo from "../../images/logonamegrey.png";
import "./index.less";

type LocalDicomSeries = {
  seriesUid: string;
  filePaths: string[];
  seriesDesc: string;
  scanMode: string;
  scanTime: string;
  name: string;
  pID: string;
  sex: string;
  birthday: string;
};

const product = "NNUNET";

function walkDirectory(fs: any, path: any, directory: string): string[] {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const filePaths: string[] = [];

  entries.forEach((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      filePaths.push(...walkDirectory(fs, path, entryPath));
    } else if (entry.isFile()) {
      filePaths.push(entryPath);
    }
  });

  return filePaths;
}

function parseLocalDicomSeries(directory: string): LocalDicomSeries[] {
  const fs = safeWindowRequire && safeWindowRequire("fs");
  const path = safeWindowRequire && safeWindowRequire("path");
  const dicomParser = safeWindowRequire && safeWindowRequire("dicom-parser");

  if (!fs || !path || !dicomParser) {
    throw new Error("当前环境不支持本地文件导入");
  }

  const groups = new Map<string, LocalDicomSeries>();
  const filePaths = walkDirectory(fs, path, directory);

  filePaths.forEach((filePath) => {
    try {
      const dataSet = dicomParser.parseDicom(fs.readFileSync(filePath));
      const seriesUid = dataSet.string("x0020000e") || filePath;
      const current = groups.get(seriesUid);

      if (current) {
        current.filePaths.push(filePath);
        return;
      }

      groups.set(seriesUid, {
        seriesUid,
        filePaths: [filePath],
        seriesDesc: (dataSet.string("x0008103e") || "").trim(),
        scanMode: (dataSet.string("x00080060") || "").trim(),
        scanTime: (dataSet.string("x00080020") || "").trim(),
        name: (dataSet.string("x00100010") || "匿名").replace(/\s*/g, ""),
        pID: (dataSet.string("x00100020") || "").trim(),
        sex: (dataSet.string("x00100040") || "").trim(),
        birthday: (dataSet.string("x00100030") || "").trim(),
      });
    } catch (error) {
      // Non-DICOM files in the selected folder are ignored.
    }
  });

  return Array.from(groups.values());
}

function buildImportStudies(seriesList: LocalDicomSeries[]) {
  const path = safeWindowRequire && safeWindowRequire("path");
  const store = getElectronStore();
  const userData = store.get("address");

  if (!path || !userData) {
    throw new Error("未找到应用数据目录");
  }

  const sep = path.sep;
  const inputRoot = userData + sep + "config" + sep + "input" + sep + product;
  const byPatient = new Map<string, LocalDicomSeries[]>();

  seriesList.forEach((series) => {
    const key = `${series.name || "匿名"}|${series.pID || ""}`;
    byPatient.set(key, [...(byPatient.get(key) || []), series]);
  });

  const studies: any[] = [];
  let skipped = 0;
  let index = 0;

  byPatient.forEach((patientSeries) => {
    const ptSeries = patientSeries.filter((series) => series.scanMode === "PT");
    const ctSeries = patientSeries.filter((series) => series.scanMode === "CT");
    const pairCount = Math.min(ptSeries.length, ctSeries.length);

    skipped += patientSeries.length - pairCount * 2;

    for (let i = 0; i < pairCount; i += 1) {
      const baseSeriesId = `${product}_${Date.now()}_${index}`;
      const pt = ptSeries[i];
      const ct = ctSeries[i];
      index += 1;

      studies.push({
        ...ct,
        seriesId: `${baseSeriesId}_CT`,
        inputPath: inputRoot + sep + `${baseSeriesId}_CT`,
        flag: "3",
      });
      studies.push({
        ...pt,
        seriesId: `${baseSeriesId}_PT`,
        inputPath: inputRoot + sep + `${baseSeriesId}_PT`,
        flag: "6",
      });
    }
  });

  return { studies, skipped };
}

const ListPage: React.FC = () => {
  const navigate = useNavigate();
  const searchName = useAppSelector((state) => state.ListPage.searchName);
  const dispatch = useAppDispatch();
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState("");

  const handleKeyPress = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.target.blur();
    }
  };

  const importLocalDicom = async () => {
    const electron = safeWindowRequire && safeWindowRequire("electron");
    const ipcRenderer = electron && electron.ipcRenderer;

    if (!ipcRenderer) {
      alert("请在Electron环境中使用本地导入");
      return;
    }

    try {
      setImporting(true);
      setImportStatus("正在选择文件夹...");
      const directory = await ipcRenderer.invoke("select-dicom-folder");

      if (!directory) {
        setImportStatus("");
        return;
      }

      setImportStatus("正在扫描DICOM...");
      const seriesList = parseLocalDicomSeries(directory);
      const { studies, skipped } = buildImportStudies(seriesList);

      if (!studies.length) {
        setImportStatus("未找到可导入的PET/CT序列");
        return;
      }

      setImportStatus("正在导入列表...");
      const result = await axios.post("http://localhost:4001/import-local", {
        product,
        studies,
      });
      const importedCount = result.data.imported ? result.data.imported.length : 0;
      const errorCount = result.data.errors ? result.data.errors.length : 0;
      const warningCount = result.data.warnings ? result.data.warnings.length : 0;
      setImportStatus(
        `导入${importedCount}条记录` +
          (skipped ? `，跳过${skipped}个未配对序列` : "") +
          (warningCount ? "，已保存到本地列表" : "") +
          (errorCount ? `，失败${errorCount}条` : "")
      );
    } catch (error) {
      console.error(error);
      setImportStatus("未找到可导入的PET/CT序列");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="ListPage clearfix">
      <div className="ListPageHeader clearfix">
        <img src={logo} alt="logo" className="logo" />

        <div className="searchBar">
          <form>
            <input
              type="text"
              placeholder="在此搜索患者信息..."
              value={searchName}
              onChange={(e) => dispatch(setSearchName(e.target.value))}
              onKeyPress={handleKeyPress}
            />
            <div className="searchBtn">
              <div className="NewIconfont">&#xe8b9;</div>
            </div>
          </form>
        </div>

        <div onClick={() => navigate("/")} className="backButton">
          <div className="NewIconfont"> &#xe8a4; 返回 </div>
        </div>

        <button
          className="importButton"
          disabled={importing}
          onClick={importLocalDicom}
        >
          {importing ? "导入中" : "导入"}
        </button>
        {importStatus ? <div className="importStatus">{importStatus}</div> : null}
      </div>

      <ListBody />
    </div>
  );
};

export default ListPage;
