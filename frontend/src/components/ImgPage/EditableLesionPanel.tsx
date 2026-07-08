import React, { useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import PubSub from "pubsub-js";
import { useAppDispatch, useAppSelector } from "../../redux/hooks";
import { updateSheets } from "../../redux/patientSlice";
import translateFocalAreas from "../../functions/translateFocalAreas";
import { safeWindowRequire } from "../../utils/electron";
import ImgPageContext from "./functions/ImgPageContext";
import {
  LESION_EDIT_CLOSE_TOPIC,
  LESION_EDIT_OPEN_TOPIC,
} from "./functions/lesionEditEvents";
import {
  MASK_ACTIVE_SEGMENT_TOPIC,
  MASK_RELOAD_TOPIC,
  MASK_VISIBLE_SEGMENTS_TOPIC,
} from "./functions/maskEvents";
import { getEffectiveOutputPath } from "./functions/pathUtils";

const fs = safeWindowRequire ? safeWindowRequire("fs") : null;
const path = safeWindowRequire ? safeWindowRequire("path") : null;
const xlsx = safeWindowRequire ? safeWindowRequire("node-xlsx") : null;
const ipcRenderer = safeWindowRequire
  ? safeWindowRequire("electron").ipcRenderer
  : null;

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

const normalizeTextValue = (value: unknown) => {
  if (value === undefined || value === null) {
    return "";
  }

  return `${value}`;
};

const createDoctorLesion = (index: number): EditableLesion => ({
  id: `${index}`,
  source: "doctor",
  lesionLabel: `${index}`,
  imageIndexs: "",
  volume: "",
  suvMax: "",
  suvMean: "",
  area: "",
});

const getAreaText = (area: string) => {
  const translatedArea = translateFocalAreas(area);
  return translatedArea === "未识别" ? area : translatedArea;
};

const getCellByHeader = (
  row: any[],
  headerIndex: Record<string, number>,
  names: string[],
  fallbackIndex: number
) => {
  const headerName = names.find((name) => headerIndex[name] !== undefined);
  const index = headerName ? headerIndex[headerName] : fallbackIndex;
  return row[index] ?? "";
};

const createHeaderIndex = (header?: any[]) =>
  (header || []).reduce<Record<string, number>>((indexMap, name, index) => {
    if (name !== undefined && name !== null && `${name}`.trim()) {
      indexMap[`${name}`.trim()] = index;
    }
    return indexMap;
  }, {});

const sheetRowToLesion = (
  data: any[],
  index: number,
  headerIndex: Record<string, number> = {}
): EditableLesion => {
  const area = getCellByHeader(data, headerIndex, ["所在区域", "区域", "部位"], 15);

  return {
    id:
      normalizeTextValue(
        getCellByHeader(data, headerIndex, ["编号", "病灶ID", "id"], 1) || data[0]
      ) ||
      `A-${index + 1}`,
    source: "algorithm",
    lesionLabel: normalizeTextValue(
      getCellByHeader(data, headerIndex, ["病灶标签", "标签", "lesionLabel"], 2)
    ),
    imageIndexs: normalizeTextValue(
      getCellByHeader(
        data,
        headerIndex,
        ["中心索引 [x, y, z]", "中心索引", "imageIndexs"],
        3
      )
    ),
    volume: formatNumber(
      getCellByHeader(data, headerIndex, ["体积", "volume"], 6)
    ),
    suvMax: formatNumber(
      getCellByHeader(data, headerIndex, ["SUV Max", "SUVmax", "suvMax"], 7)
    ),
    suvMean: formatNumber(
      getCellByHeader(data, headerIndex, ["SUV Mean", "SUVmean", "suvMean"], 8)
    ),
    area: getAreaText(area),
  };
};

const parseCsvRows = (content: string) =>
  content
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => line.split(",").map((cell) => cell.trim()));

const parseJsonRows = (content: string) => {
  const json = JSON.parse(content);
  if (Array.isArray(json)) {
    return json;
  }
  if (Array.isArray(json.data)) {
    return json.data;
  }
  if (Array.isArray(json.lesions)) {
    return json.lesions;
  }
  return [];
};

const normalizeImportedRows = (rows: any[]) => {
  if (!rows.length) {
    return [];
  }

  const dataRows = Array.isArray(rows[0]) ? rows.slice(1) : rows;

  return dataRows.map((row: any, index: number) => {
    if (Array.isArray(row)) {
      const headerIndex = createHeaderIndex(rows[0]);
      return [
        normalizeTextValue(
          getCellByHeader(row, headerIndex, ["编号", "病灶ID", "id"], 1) || row[0]
        ) ||
          `A-${index + 1}`,
        normalizeTextValue(
          getCellByHeader(row, headerIndex, ["病灶标签", "标签", "lesionLabel"], 2)
        ),
        normalizeTextValue(
          getCellByHeader(
            row,
            headerIndex,
            ["中心索引 [x, y, z]", "中心索引", "imageIndexs"],
            3
          )
        ),
        normalizeTextValue(
          getCellByHeader(row, headerIndex, ["SUV Max", "SUVmax", "suvMax"], 7)
        ),
        normalizeTextValue(
          getCellByHeader(row, headerIndex, ["SUV Mean", "SUVmean", "suvMean"], 8)
        ),
        normalizeTextValue(
          getCellByHeader(row, headerIndex, ["体积", "volume"], 6)
        ),
        normalizeTextValue(
          getCellByHeader(row, headerIndex, ["所在区域", "区域", "部位"], 16)
        ),
      ];
    }

    return [
      normalizeTextValue(row.id || row.lesionId || `A-${index + 1}`),
      normalizeTextValue(row.lesionLabel || row.label || row.segmentIndex || ""),
      normalizeTextValue(row.imageIndexs || row.imageIndexes || row.indexes || ""),
      normalizeTextValue(row.suvMax || row.SUVmax || row.suv_max || ""),
      normalizeTextValue(row.suvMean || row.SUVmean || row.suv_mean || ""),
      normalizeTextValue(row.volume || row.volumeMl || ""),
      normalizeTextValue(row.area || row.location || row.part || ""),
    ];
  });
};

const EditableLesionPanel: React.FC = () => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { selectedLesions, setSelectedLesions } = useContext(ImgPageContext);
  const patientInfo = useAppSelector((state) => state.patient.patientInfo);
  const sheets = useAppSelector((state) => state.patient.sheets);
  const [doctorLesions, setDoctorLesions] = useState<EditableLesion[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const [checkedLesions, setCheckedLesions] = useState<string[]>(
    selectedLesions.current || []
  );
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

  const collectAlgorithmFiles = (filePaths: string[]) => {
    if (!fs || !path) {
      return [];
    }

    return filePaths.flatMap((filePath) => {
      try {
        if (fs.statSync(filePath).isDirectory()) {
          return fs
            .readdirSync(filePath)
            .map((fileName: string) => path.join(filePath, fileName));
        }
      } catch (error) {
        return [];
      }

      return [filePath];
    });
  };

  const readLesionRows = (filePath: string) => {
    if (!fs || !path) {
      return [];
    }

    const ext = path.extname(filePath).toLowerCase();

    if (ext === ".xlsx" || ext === ".xls") {
      if (!xlsx) {
        throw new Error("Excel parser is unavailable");
      }

      return xlsx.parse(filePath)[0]?.data || [];
    }

    if (ext === ".csv") {
      return parseCsvRows(fs.readFileSync(filePath, "utf8"));
    }

    if (ext === ".json") {
      return parseJsonRows(fs.readFileSync(filePath, "utf8"));
    }

    return [];
  };

  const applyLesionRows = (rows: any[], sourceName: string) => {
    const nextData = normalizeImportedRows(rows);

    dispatch(
      updateSheets({
        0: {
          name: sourceName,
          header: [
            "编号",
            "病灶标签",
            "中心索引 [x, y, z]",
            "SUV Max",
            "SUV Mean",
            "体积",
            "所在区域",
          ],
          data: nextData,
        },
      })
    );
    setSelectedId("");
    setCheckedLesions([]);
    return nextData.length;
  };

  const importAlgorithmFile = async () => {
    if (!fs || !path || !ipcRenderer) {
      setImportMessage("当前环境无法选择算法文件");
      return;
    }

    const selectedPaths = await ipcRenderer.invoke("select-algorithm-file");
    const filePaths = Array.isArray(selectedPaths)
      ? selectedPaths
      : selectedPaths
        ? [selectedPaths]
        : [];

    if (!filePaths.length) {
      setImportMessage("已取消导入");
      return;
    }

    const algorithmFiles = collectAlgorithmFiles(filePaths);
    const niftiFiles = algorithmFiles.filter(isNiftiFile);
    const lesionReport =
      algorithmFiles.find(
        (filePath: string) => getLowerFileName(filePath) === "lesion_report.xlsx"
      ) || algorithmFiles.find(isLesionReportFile);
    if (!niftiFiles.length) {
      setImportMessage("当前仅支持导入 NIfTI 算法Mask（.nii / .nii.gz）");
      return;
    }

    if (!effectiveOutputPath) {
      setImportMessage("当前病例缺少输出目录，无法保存算法Mask");
      return;
    }

    try {
      const segmentationDir = path.join(effectiveOutputPath, "out", "segmentation");
      const importsDir = path.join(segmentationDir, "algorithm_imports");
      const targetPath = path.join(segmentationDir, "algorithm_mask.nii.gz");
      fs.mkdirSync(segmentationDir, { recursive: true });
      fs.mkdirSync(importsDir, { recursive: true });

      niftiFiles.forEach((filePath: string) => {
        fs.copyFileSync(filePath, path.join(importsDir, path.basename(filePath)));
      });

      const primaryMask =
        niftiFiles.find((filePath: string) => getLowerFileName(filePath) === "autopet.nii.gz") ||
        niftiFiles[0];
      fs.copyFileSync(primaryMask, targetPath);

      let lesionCount = 0;
      if (lesionReport) {
        const reportTargetPath = path.join(effectiveOutputPath, "out", path.basename(lesionReport));
        fs.mkdirSync(path.dirname(reportTargetPath), { recursive: true });
        fs.copyFileSync(lesionReport, reportTargetPath);
        lesionCount = applyLesionRows(readLesionRows(lesionReport), path.basename(lesionReport));
      }

      const skippedCount = algorithmFiles.length - niftiFiles.length - (lesionReport ? 1 : 0);
      setImportMessage(
        `已导入 ${niftiFiles.length} 个算法文件，当前Mask：${path.basename(primaryMask)}${
          lesionReport ? `，病灶列表 ${lesionCount} 条` : ""
        }${
          skippedCount > 0 ? `，跳过 ${skippedCount} 个其他文件` : ""
        }`
      );
      PubSub.publish(MASK_RELOAD_TOPIC, { source: "algorithm" });
    } catch (error) {
      console.error("Failed to import algorithm mask:", error);
      setImportMessage("算法Mask导入失败");
    }
  };

  const importLesionList = async () => {
    if (!fs || !path || !ipcRenderer) {
      setImportMessage("当前环境无法选择病灶列表文件");
      return;
    }

    const filePath = await ipcRenderer.invoke("select-lesion-list-file");
    if (!filePath) {
      setImportMessage("已取消导入");
      return;
    }

    try {
      setImportMessage("正在导入病灶列表...");
      const ext = path.extname(filePath).toLowerCase();
      if (![".xlsx", ".xls", ".csv", ".json"].includes(ext)) {
        setImportMessage("暂不支持该病灶列表格式");
        return;
      }

      const lesionCount = applyLesionRows(readLesionRows(filePath), path.basename(filePath));
      setImportMessage(`已导入 ${lesionCount} 条病灶列表记录`);
    } catch (error) {
      console.error("Failed to import lesion list:", error);
      setImportMessage("病灶列表文件读取失败");
    }
  };

  const algorithmLesions = useMemo(
    () =>
      sheets[0].data.map((data: any[], index: number) => {
        const headerIndex = createHeaderIndex((sheets[0] as any).header);
        return sheetRowToLesion(data, index, headerIndex);
      }),
    [sheets]
  );

  const lesions = [...algorithmLesions, ...doctorLesions];
  const lesionSelectionValues = useMemo(
    () =>
      Array.from(
        new Set(
          lesions
            .map((lesion) => normalizeTextValue(lesion.lesionLabel).trim())
            .filter((lesionLabel) => !!lesionLabel)
        )
      ),
    [lesions]
  );

  const syncCheckedLesions = (nextCheckedLesions: string[]) => {
    const nextValues = Array.from(
      new Set(
        nextCheckedLesions
          .map((lesionLabel) => lesionLabel.trim())
          .filter((lesionLabel) => !!lesionLabel)
      )
    );

    setCheckedLesions(nextValues);
    selectedLesions.current = nextValues;
    setSelectedLesions(nextValues);
    PubSub.publish(MASK_VISIBLE_SEGMENTS_TOPIC, nextValues);
  };

  useEffect(() => {
    const validCheckedLesions = checkedLesions.filter((lesionLabel) =>
      lesionSelectionValues.includes(lesionLabel)
    );

    if (!lesionSelectionValues.length) {
      if (checkedLesions.length) {
        syncCheckedLesions([]);
      }
      return;
    }

    if (!validCheckedLesions.length) {
      syncCheckedLesions(lesionSelectionValues);
      return;
    }

    if (validCheckedLesions.length !== checkedLesions.length) {
      syncCheckedLesions(validCheckedLesions);
    }
  }, [checkedLesions, lesionSelectionValues]);

  const updateDoctorLesion = (
    id: string,
    key: keyof EditableLesion,
    value: string
  ) => {
    setDoctorLesions((previous) =>
      previous.map((lesion) =>
        lesion.id === id ? { ...lesion, [key]: value } : lesion
      )
    );
  };

  const updateAlgorithmLesion = (
    id: string,
    key: keyof EditableLesion,
    value: string
  ) => {
    dispatch(
      updateSheets({
        ...sheets,
        0: {
          ...sheets[0],
          data: sheets[0].data.map((row: string[], index: number) => {
            const headerIndex = createHeaderIndex((sheets[0] as any).header);
            const lesion = sheetRowToLesion(row, index, headerIndex);

            if (lesion.id !== id) {
              return row;
            }

            const nextRow = [...row];
            const setCell = (names: string[], fallbackIndex: number) => {
              const headerName = names.find((name) => headerIndex[name] !== undefined);
              nextRow[headerName ? headerIndex[headerName] : fallbackIndex] = value;
            };
            if (key === "volume") setCell(["体积", "volume"], 5);
            if (key === "suvMax") setCell(["SUV Max", "SUVmax", "suvMax"], 3);
            if (key === "suvMean") setCell(["SUV Mean", "SUVmean", "suvMean"], 4);
            if (key === "area") setCell(["所在区域", "区域", "部位"], 6);
            return nextRow;
          }),
        },
      })
    );
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
    const nextLesion = createDoctorLesion(lesions.length + 1);
    setDoctorLesions((previous) => [...previous, nextLesion]);
    setSelectedId(nextLesion.id);
  };

  const ensureVisibleLesion = (lesion: EditableLesion) => {
    const lesionLabel = normalizeTextValue(lesion.lesionLabel).trim();
    if (!lesionLabel || checkedLesions.includes(lesionLabel)) {
      return;
    }

    syncCheckedLesions([...checkedLesions, lesionLabel]);
  };

  const toggleLesionVisibility = (lesion: EditableLesion, checked: boolean) => {
    const lesionLabel = normalizeTextValue(lesion.lesionLabel).trim();
    if (!lesionLabel) {
      return;
    }

    syncCheckedLesions(
      checked
        ? [...checkedLesions, lesionLabel]
        : checkedLesions.filter((value) => value !== lesionLabel)
    );
  };

  const locateLesion = (lesion: EditableLesion) => {
    ensureVisibleLesion(lesion);
    const lesionLabel = Number(lesion.lesionLabel);
    if (Number.isFinite(lesionLabel) && lesionLabel > 0) {
      PubSub.publish(MASK_ACTIVE_SEGMENT_TOPIC, lesionLabel);
    }

    if (!lesion.imageIndexs) {
      return;
    }

    const imageIndexs = lesion.imageIndexs.match(/\d+(\.\d+)?/g)?.map((imgIndex) =>
      Math.round(parseFloat(imgIndex))
    );

    if (imageIndexs?.length) {
      PubSub.publish("imgJumpByIndex", imageIndexs);
      setSelectedId(lesion.id);
    }
  };

  const editMask = (lesion: EditableLesion) => {
    ensureVisibleLesion(lesion);
    PubSub.publish(LESION_EDIT_OPEN_TOPIC, lesion);
    navigate(
      `/LesionEditPage?lesionId=${encodeURIComponent(lesion.id)}` +
        `&lesionLabel=${encodeURIComponent(lesion.lesionLabel || "")}` +
        `&imageIndexs=${encodeURIComponent(lesion.imageIndexs || "")}`
    );
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
          <button type="button" onClick={importAlgorithmFile}>
            导入算法
          </button>
          <button type="button" onClick={importLesionList}>
            导入病灶列表
          </button>
          <button type="button" onClick={addDoctorLesion}>
            新增病灶
          </button>
        </div>
      </div>
      {importMessage ? (
        <div className="editableLesionMessage">{importMessage}</div>
      ) : null}
      <div className="editableLesionTable">
        <div className="editableLesionRow editableLesionHead">
          <span>显示</span>
          <span>病灶ID</span>
          <span>来源</span>
          <span>标签</span>
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
                ensureVisibleLesion(lesion);
                const lesionLabel = Number(lesion.lesionLabel);
                if (Number.isFinite(lesionLabel) && lesionLabel > 0) {
                  PubSub.publish(MASK_ACTIVE_SEGMENT_TOPIC, lesionLabel);
                }
              }}
            >
              <span className="editableLesionCheckboxCell">
                <input
                  type="checkbox"
                  checked={checkedLesions.includes(
                    normalizeTextValue(lesion.lesionLabel)
                  )}
                  onChange={(event) =>
                    toggleLesionVisibility(lesion, event.target.checked)
                  }
                  onClick={(event) => event.stopPropagation()}
                />
              </span>
              <span>{lesion.id}</span>
              <span>{lesion.source === "algorithm" ? "算法" : "医生"}</span>
              <span>{lesion.lesionLabel || "-"}</span>
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
            未读取到病灶列表，可导入病灶列表或新增病灶。
          </div>
        )}
      </div>
    </div>
  );
};

export default EditableLesionPanel;
