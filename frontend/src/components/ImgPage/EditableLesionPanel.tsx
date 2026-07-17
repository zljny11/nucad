import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import PubSub from "pubsub-js";
import CORNERSTONE_COLOR_LUT from "@cornerstonejs/tools/dist/esm/constants/COLOR_LUT";
import { useAppDispatch, useAppSelector } from "../../redux/hooks";
import { updateSheets } from "../../redux/patientSlice";
import translateFocalAreas from "../../functions/translateFocalAreas";
import { safeWindowRequire } from "../../utils/electron";
import {
  LESION_EDIT_CLOSE_TOPIC,
  LESION_EDIT_OPEN_TOPIC,
} from "./functions/lesionEditEvents";
import {
  MASK_ACTIVE_SEGMENT_TOPIC,
  MASK_EXPORT_TOPIC,
  MASK_FOCUS_SEGMENT_TOPIC,
  MASK_RELOAD_TOPIC,
} from "./functions/maskEvents";
import { getEffectiveOutputPath } from "./functions/pathUtils";
import {
  createEmptyMeta,
  createSheetEntry,
  getAlgorithmImportsDir,
  getAlgorithmMaskPath,
  getAlgorithmReportMetaPath,
  getCellByHeader,
  getDoctorMaskPath,
  getDoctorReportMetaPath,
  getDoctorReportXlsxPath,
  getSegmentationDir,
  normalizeTextValue,
  readLesionRows,
  readLesionWorkbookInfo,
  writeJson,
} from "./functions/lesionReportCache";

const fs = safeWindowRequire ? safeWindowRequire("fs") : null;
const path = safeWindowRequire ? safeWindowRequire("path") : null;
const ipcRenderer = safeWindowRequire
  ? safeWindowRequire("electron").ipcRenderer
  : null;
const EDIT_NAVIGATION_DELAY_MS = 180;
const LESION_EDIT_FOCUS_STORAGE_KEY = "nucad:lesionEditFocus";

type LesionSource = "algorithm" | "doctor";

interface EditableLesion {
  id: string;
  source: LesionSource;
  lesionLabel: string;
  imageIndexs: string;
  volume: string;
  suvMax: string;
  suvMean: string;
  area: string;
}

const formatNumber = (value: string) => {
  const numberValue = parseFloat(value);
  return Number.isFinite(numberValue) ? numberValue.toFixed(2) : "";
};

const createDoctorLesionRow = (index: number): string[] => [
  `${index}`,
  `${index}`,
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
];

const getAreaText = (area: string) => {
  const translatedArea = translateFocalAreas(area);
  return translatedArea === "未识别" ? area : translatedArea;
};

const getLesionColor = (lesionLabel: string) => {
  const segmentIndex = Math.round(Number(lesionLabel));
  const color =
    Number.isFinite(segmentIndex) && segmentIndex > 0
      ? CORNERSTONE_COLOR_LUT[segmentIndex % CORNERSTONE_COLOR_LUT.length]
      : null;

  return color
    ? `rgb(${color[0]}, ${color[1]}, ${color[2]})`
    : "transparent";
};

const sheetRowToLesion = (
  data: string[],
  index: number,
  source: LesionSource,
  headerIndex: Record<string, number> = {}
): EditableLesion => {
  const normalizedRow =
    data.length >= 15
      ? data
      : [
          normalizeTextValue(getCellByHeader(data, headerIndex, ["编号", "病灶ID", "id"], 0)),
          normalizeTextValue(
            getCellByHeader(data, headerIndex, ["病灶标签", "标签", "lesionLabel"], 1)
          ),
          normalizeTextValue(
            getCellByHeader(
              data,
              headerIndex,
              ["中心索引 [x, y, z]", "中心索引", "imageIndexs"],
              2
            )
          ),
          normalizeTextValue(
            getCellByHeader(data, headerIndex, ["中心位置 [x, y, z]", "中心位置"], 3)
          ),
          normalizeTextValue(
            getCellByHeader(data, headerIndex, ["范围 [dx, dy, dz]", "范围"], 4)
          ),
          normalizeTextValue(getCellByHeader(data, headerIndex, ["体积", "volume"], 5)),
          normalizeTextValue(
            getCellByHeader(data, headerIndex, ["SUV Max", "SUVmax", "suvMax"], 6)
          ),
          normalizeTextValue(
            getCellByHeader(data, headerIndex, ["SUV Mean", "SUVmean", "suvMean"], 7)
          ),
          normalizeTextValue(getCellByHeader(data, headerIndex, ["SUV Std", "suvStd"], 8)),
          normalizeTextValue(getCellByHeader(data, headerIndex, ["CT Centroid"], 9)),
          normalizeTextValue(getCellByHeader(data, headerIndex, ["CT Min"], 10)),
          normalizeTextValue(getCellByHeader(data, headerIndex, ["CT Max"], 11)),
          normalizeTextValue(getCellByHeader(data, headerIndex, ["CT Mean"], 12)),
          normalizeTextValue(getCellByHeader(data, headerIndex, ["CT Std"], 13)),
          normalizeTextValue(
            getCellByHeader(data, headerIndex, ["所在区域", "区域", "部位"], 14)
          ),
        ];

  return {
    id: normalizeTextValue(normalizedRow[0]) || `${source === "doctor" ? "D" : "A"}-${index + 1}`,
    source,
    lesionLabel: normalizeTextValue(normalizedRow[1]),
    imageIndexs: normalizeTextValue(normalizedRow[2]),
    suvMax: formatNumber(normalizedRow[6]),
    suvMean: formatNumber(normalizedRow[7]),
    volume: formatNumber(normalizedRow[5]),
    area: getAreaText(normalizedRow[14]),
  };
};

const EditableLesionPanel: React.FC = () => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const patientInfo = useAppSelector((state) => state.patient.patientInfo);
  const sheets = useAppSelector((state) => state.patient.sheets);
  const [selectedId, setSelectedId] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const effectiveOutputPath = getEffectiveOutputPath(
    patientInfo.outputPath,
    patientInfo.inputPath
  );

  const getLowerFileName = (filePath: string) =>
    path ? path.basename(filePath).toLowerCase() : filePath.toLowerCase();

  const isNiftiFile = (filePath: string) => {
    const fileName = getLowerFileName(filePath);
    return !fileName.startsWith("._") && (fileName.endsWith(".nii") || fileName.endsWith(".nii.gz"));
  };

  const isLesionReportFile = (filePath: string) => {
    const fileName = getLowerFileName(filePath);
    return !fileName.startsWith("._") && (
      fileName.endsWith(".xlsx") ||
      fileName.endsWith(".xls") ||
      fileName.endsWith(".csv") ||
      fileName.endsWith(".json")
    );
  };

  const algorithmLesions = useMemo(
    () => sheets[0].data.map((data, index) => sheetRowToLesion(data, index, "algorithm")),
    [sheets]
  );
  const doctorLesions = useMemo(
    () =>
      (sheets[0].doctorData || []).map((data, index) =>
        sheetRowToLesion(data, index, "doctor")
      ),
    [sheets]
  );
  const lesions = useMemo(
    () => [...algorithmLesions, ...doctorLesions],
    [algorithmLesions, doctorLesions]
  );
  const updateSheetState = (nextPatch: { data?: string[][]; doctorData?: string[][]; name?: string; meta?: any; header?: string[] }) => {
    dispatch(
      updateSheets({
        0: {
          ...sheets[0],
          ...nextPatch,
        },
      })
    );
  };

  const importResultDirectory = async () => {
    if (!fs || !path || !ipcRenderer) {
      setImportMessage("当前环境无法选择结果目录");
      return;
    }

    const resultDir = await ipcRenderer.invoke("select-result-directory");
    if (!resultDir) {
      setImportMessage("已取消导入");
      return;
    }

    if (!effectiveOutputPath) {
      setImportMessage("当前病例缺少输出目录，无法保存结果缓存");
      return;
    }

    try {
      const resultFiles = fs
        .readdirSync(resultDir)
        .map((fileName: string) => path.join(resultDir, fileName))
        .filter((filePath: string) => fs.statSync(filePath).isFile());
      const niftiFiles = resultFiles.filter(isNiftiFile);
      const lesionReportPath =
        resultFiles.find(
          (filePath: string) => getLowerFileName(filePath) === "lesion_report.xlsx"
        ) || resultFiles.find(isLesionReportFile);

      if (!niftiFiles.length || !lesionReportPath) {
        setImportMessage("结果目录必须同时包含 NIfTI mask 和病灶列表文件");
        return;
      }

      const segmentationDir = getSegmentationDir(effectiveOutputPath);
      const algorithmImportsDir = getAlgorithmImportsDir(effectiveOutputPath);
      const algorithmMaskPath = getAlgorithmMaskPath(effectiveOutputPath);
      const algorithmReportMetaPath = getAlgorithmReportMetaPath(effectiveOutputPath);
      const doctorMaskPath = getDoctorMaskPath(effectiveOutputPath);
      const doctorReportXlsxPath = getDoctorReportXlsxPath(effectiveOutputPath);
      const doctorReportMetaPath = getDoctorReportMetaPath(effectiveOutputPath);
      const reportExt = path.extname(lesionReportPath).toLowerCase() || ".xlsx";
      const cachedReportPath = path.join(segmentationDir, `algorithm_lesion_report${reportExt}`);
      const lesionWorkbookInfo = readLesionWorkbookInfo(lesionReportPath);

      fs.mkdirSync(segmentationDir, { recursive: true });
      fs.mkdirSync(algorithmImportsDir, { recursive: true });

      niftiFiles.forEach((filePath: string) => {
        fs.copyFileSync(filePath, path.join(algorithmImportsDir, path.basename(filePath)));
      });

      const primaryMask =
        niftiFiles.find((filePath: string) => getLowerFileName(filePath) === "autopet.nii.gz") ||
        niftiFiles[0];
      fs.copyFileSync(primaryMask, algorithmMaskPath);
      fs.copyFileSync(lesionReportPath, cachedReportPath);

      [doctorMaskPath, doctorReportXlsxPath, doctorReportMetaPath].forEach((filePath: string) => {
        if (filePath && fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      });

      const importedAt = new Date().toISOString();
      const nextMeta = {
        ...createEmptyMeta(),
        sourceType: "algorithm" as const,
        sourcePath: lesionReportPath,
        cachePath: cachedReportPath,
        templatePath: cachedReportPath,
        templateExt: reportExt,
        templateFileName: path.basename(lesionReportPath),
        templateSheetName: lesionWorkbookInfo.sheetName || "lesion_report",
        importedAt,
      };

      writeJson(algorithmReportMetaPath, {
        ...nextMeta,
        primaryMaskFileName: path.basename(primaryMask),
        resultDir,
      });

      const nextEntry = createSheetEntry(readLesionRows(cachedReportPath), {
        name: path.basename(lesionReportPath),
        meta: nextMeta,
        doctorData: [],
      });
      updateSheetState(nextEntry);
      setSelectedId("");
      setImportMessage(
        `已导入结果目录：${path.basename(resultDir)}，mask ${path.basename(primaryMask)}，病灶 ${nextEntry.data.length} 条`
      );
      PubSub.publish(MASK_RELOAD_TOPIC, { source: "algorithm" });
    } catch (error) {
      console.error("Failed to import result directory:", error);
      setImportMessage("结果目录导入失败");
    }
  };

  const updateAlgorithmLesion = (
    id: string,
    key: keyof EditableLesion,
    value: string
  ) => {
    updateSheetState({
      data: sheets[0].data.map((row: string[], index: number) => {
        const lesion = sheetRowToLesion(row, index, "algorithm");

        if (lesion.id !== id) {
          return row;
        }

        const nextRow = [...row];
        if (key === "imageIndexs") nextRow[2] = value;
        if (key === "suvMax") nextRow[6] = value;
        if (key === "suvMean") nextRow[7] = value;
        if (key === "volume") nextRow[5] = value;
        if (key === "area") nextRow[14] = value;
        if (key === "lesionLabel") nextRow[1] = value;
        return nextRow;
      }),
    });
  };

  const updateDoctorLesion = (
    id: string,
    key: keyof EditableLesion,
    value: string
  ) => {
    updateSheetState({
      doctorData: (sheets[0].doctorData || []).map((row: string[], index: number) => {
        const lesion = sheetRowToLesion(row, index, "doctor");

        if (lesion.id !== id) {
          return row;
        }

        const nextRow = [...row];
        if (key === "lesionLabel") nextRow[1] = value;
        if (key === "imageIndexs") nextRow[2] = value;
        if (key === "suvMax") nextRow[6] = value;
        if (key === "suvMean") nextRow[7] = value;
        if (key === "volume") nextRow[5] = value;
        if (key === "area") nextRow[14] = value;
        return nextRow;
      }),
    });
  };

  const updateLesion = (
    lesion: EditableLesion,
    key: keyof EditableLesion,
    value: string
  ) => {
    if (lesion.source === "doctor") {
      updateDoctorLesion(lesion.id, key, value);
      return;
    }

    updateAlgorithmLesion(lesion.id, key, value);
  };

  const addDoctorLesion = () => {
    const nextRow = createDoctorLesionRow(lesions.length + 1);
    updateSheetState({
      doctorData: [...(sheets[0].doctorData || []), nextRow],
    });
    setSelectedId(nextRow[0]);
  };

  const locateLesion = (lesion: EditableLesion) => {
    setSelectedId(lesion.id);
    const lesionLabel = Number(lesion.lesionLabel);
    if (Number.isFinite(lesionLabel) && lesionLabel > 0) {
      PubSub.publish(MASK_ACTIVE_SEGMENT_TOPIC, lesionLabel);
      PubSub.publish(MASK_FOCUS_SEGMENT_TOPIC, lesionLabel);
    }
  };

  const editMask = (lesion: EditableLesion) => {
    locateLesion(lesion);
    window.sessionStorage.setItem(
      LESION_EDIT_FOCUS_STORAGE_KEY,
      JSON.stringify({
        lesionId: lesion.id,
        lesionLabel: lesion.lesionLabel || "",
        imageIndexs: lesion.imageIndexs || "",
      })
    );
    PubSub.publish(LESION_EDIT_OPEN_TOPIC, lesion);
    window.setTimeout(() => {
      navigate(
        `/LesionEditPage?lesionId=${encodeURIComponent(lesion.id)}` +
          `&lesionLabel=${encodeURIComponent(lesion.lesionLabel || "")}` +
          `&imageIndexs=${encodeURIComponent(lesion.imageIndexs || "")}`
      );
    }, EDIT_NAVIGATION_DELAY_MS);
  };

  return (
    <div
      className={
        importMessage
          ? "editableLesionPanel hasImportMessage"
          : "editableLesionPanel"
      }
    >
      <div className="editableLesionToolbar">
        <button
          type="button"
          className="editableLesionCollapse"
          onClick={() => PubSub.publish(LESION_EDIT_CLOSE_TOPIC)}
        >
          ›
        </button>
        <div className="editableLesionTitle">病灶列表</div>
        <div className="editableLesionToolbarActions">
          <button type="button" onClick={importResultDirectory}>
            导入
          </button>
          <button type="button" onClick={() => PubSub.publish(MASK_EXPORT_TOPIC)}>
            导出
          </button>
          <button type="button" onClick={addDoctorLesion}>
            新增
          </button>
        </div>
      </div>
      {importMessage ? (
        <div className="editableLesionMessage">{importMessage}</div>
      ) : null}
      <div className="editableLesionTable">
        <div className="editableLesionRow editableLesionHead">
          <span>病灶ID</span>
          <span>来源</span>
          <span>颜色</span>
          <span>SUVmax</span>
          <span>SUVmean</span>
          <span>体积(ml)</span>
          <span>部位</span>
          <span>操作</span>
        </div>
        {lesions.length ? (
          lesions.map((lesion) => (
            <div
              className={
                selectedId === lesion.id
                  ? "editableLesionRow selected"
                  : "editableLesionRow"
              }
              key={`${lesion.source}-${lesion.id}`}
              onClick={() => {
                setSelectedId(lesion.id);
                const lesionLabel = Number(lesion.lesionLabel);
                if (Number.isFinite(lesionLabel) && lesionLabel > 0) {
                  PubSub.publish(MASK_ACTIVE_SEGMENT_TOPIC, lesionLabel);
                }
              }}
            >
              <span>{lesion.id}</span>
              <span>{lesion.source === "algorithm" ? "算法" : "医生"}</span>
              <span className="editableLesionColorCell">
                <span
                  className="editableLesionColorSwatch"
                  style={{ backgroundColor: getLesionColor(lesion.lesionLabel) }}
                  title={`病灶标签 ${lesion.lesionLabel || "-"}`}
                />
              </span>
              <input
                value={lesion.suvMax}
                onChange={(event) =>
                  updateLesion(lesion, "suvMax", event.target.value)
                }
              />
              <input
                value={lesion.suvMean}
                onChange={(event) =>
                  updateLesion(lesion, "suvMean", event.target.value)
                }
              />
              <input
                value={lesion.volume}
                onChange={(event) =>
                  updateLesion(lesion, "volume", event.target.value)
                }
              />
              <input
                value={lesion.area}
                onChange={(event) =>
                  updateLesion(lesion, "area", event.target.value)
                }
              />
              <span className="editableLesionActions">
                <button type="button" onClick={() => locateLesion(lesion)}>
                  定位
                </button>
                <button type="button" onClick={() => editMask(lesion)}>
                  编辑
                </button>
              </span>
            </div>
          ))
        ) : (
          <div className="editableLesionEmpty">
            未读取到病灶列表，可导入结果目录或新增病灶。
          </div>
        )}
      </div>
    </div>
  );
};

export default EditableLesionPanel;
