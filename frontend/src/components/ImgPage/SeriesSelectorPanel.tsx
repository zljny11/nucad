import React, { useMemo, useState } from "react";
import { useAppSelector } from "../../redux/hooks";
import { safeWindowRequire } from "../../utils/electron";

const fs = safeWindowRequire ? safeWindowRequire("fs") : null;
const path = safeWindowRequire ? safeWindowRequire("path") : null;
const dicomParser = safeWindowRequire ? safeWindowRequire("dicom-parser") : null;

type Modality = "PET" | "CT";

interface SeriesOption {
  id: string;
  label: string;
  petPath: string;
  ctPath: string;
  petCount: number;
  ctCount: number;
  active: boolean;
}

export interface SelectedSeries {
  id: string;
  label: string;
  petPath: string;
  ctPath: string;
}

interface SeriesSelectorPanelProps {
  selectedSeriesId: string;
  onSeriesChange: (series: SelectedSeries) => void;
}

const getBaseName = (filePath: string) =>
  path ? path.basename(filePath) : filePath.split(/[\\/]/).pop() || filePath;

const getParentDir = (filePath: string) =>
  path ? path.dirname(filePath) : filePath.replace(/[\\/][^\\/]*$/, "");

const normalizePath = (filePath: string) =>
  String(filePath || "").replace(/\\/g, "/").toLowerCase();

const getDicomCount = (dirPath: string) => {
  if (!fs || !path || !dirPath || !fs.existsSync(dirPath)) {
    return 0;
  }

  try {
    return fs
      .readdirSync(dirPath)
      .filter((fileName: string) => {
        const lowerFileName = fileName.toLowerCase();
        return lowerFileName.endsWith(".dcm") && !lowerFileName.startsWith("._");
      }).length;
  } catch (error) {
    return 0;
  }
};

const getImportedBatchPrefix = (dirName: string) => {
  const match = dirName.match(/^(.+)_\d+_(PT|CT)$/i);
  return match ? match[1] : "";
};

const isSameImportedBatchSeries = (dirName: string, batchPrefix: string) => {
  if (!batchPrefix) {
    return true;
  }

  return new RegExp(`^${batchPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}_\\d+_(PT|CT)$`, "i").test(dirName);
};

const getDicomSeriesDescription = (dirPath: string) => {
  if (!fs || !path || !dicomParser || !dirPath || !fs.existsSync(dirPath)) {
    return "";
  }

  try {
    const fileName = fs
      .readdirSync(dirPath)
      .find((name: string) => {
        const lowerName = name.toLowerCase();
        return lowerName.endsWith(".dcm") && !lowerName.startsWith("._");
      });

    if (!fileName) {
      return "";
    }

    const dataSet = dicomParser.parseDicom(
      fs.readFileSync(path.join(dirPath, fileName))
    );
    return (dataSet.string("x0008103e") || "").trim();
  } catch (error) {
    return "";
  }
};

const getSeriesLabel = (dirName: string) => {
  const importedPairMatch = dirName.match(/(.+)_(PT|CT)$/i);

  if (importedPairMatch) {
    return importedPairMatch[1];
  }

  if (/brain/i.test(dirName)) {
    return "Brain";
  }

  if (/(^|[_\-\s])wb([_\-\s]|$)|whole/i.test(dirName)) {
    return "WB";
  }

  return dirName.replace(/^(pet|ct)[_\-\s]*/i, "") || dirName;
};

const getDisplayLabel = (dirPath: string, fallback: string) => {
  const dicomDescription = getDicomSeriesDescription(dirPath);

  if (dicomDescription) {
    return getSeriesLabel(dicomDescription);
  }

  return fallback;
};

const getPairKey = (dirName: string) =>
  getSeriesLabel(dirName).toLowerCase().replace(/[^a-z0-9]+/g, "_");

const getModality = (dirName: string): Modality | null => {
  if (/^pet|[_\-\s]pet|_pt$/i.test(dirName)) {
    return "PET";
  }

  if (/^ct|[_\-\s]ct|_ct$/i.test(dirName)) {
    return "CT";
  }

  return null;
};

const readConfigPaths = (outputPath: string) => {
  if (!fs || !path || !outputPath) {
    return { petPath: "", ctPath: "" };
  }

  const configPaths = [
    path.join(outputPath, "config.json"),
    path.join(outputPath, "out", "config.json"),
  ];
  const configPath = configPaths.find((candidate) => fs.existsSync(candidate));

  if (!configPath) {
    return { petPath: "", ctPath: "" };
  }

  try {
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    return {
      petPath: config.pt_path || "",
      ctPath: config.ct_path || "",
    };
  } catch (error) {
    return { petPath: "", ctPath: "" };
  }
};

const discoverSeriesOptions = (inputPath: string, outputPath: string) => {
  if (!fs || !path || !inputPath) {
    return [];
  }

  const parentDir = getParentDir(inputPath);

  if (!parentDir || !fs.existsSync(parentDir)) {
    return [];
  }

  const configPaths = readConfigPaths(outputPath);
  const importedBatchPrefix = getImportedBatchPrefix(getBaseName(inputPath));
  const activePetPath = normalizePath(configPaths.petPath || inputPath);
  const activeCtPath = normalizePath(configPaths.ctPath);
  const groups: Record<
    string,
    {
      label: string;
      petPath: string;
      ctPath: string;
    }
  > = {};

  fs.readdirSync(parentDir, { withFileTypes: true })
    .filter((entry: any) => entry.isDirectory())
    .filter((entry: any) => isSameImportedBatchSeries(entry.name, importedBatchPrefix))
    .forEach((entry: any) => {
      const modality = getModality(entry.name);

      if (!modality) {
        return;
      }

      const key = getPairKey(entry.name);
      const dirPath = path.join(parentDir, entry.name);
      groups[key] = groups[key] || {
        label: getSeriesLabel(entry.name),
        petPath: "",
        ctPath: "",
      };

      if (modality === "PET") {
        groups[key].petPath = dirPath;
      } else {
        groups[key].ctPath = dirPath;
      }
    });

  return Object.entries(groups)
    .map(([key, group]) => {
      const displayLabel = getDisplayLabel(group.petPath || group.ctPath, group.label);
      const normalizedPetPath = normalizePath(group.petPath);
      const normalizedCtPath = normalizePath(group.ctPath);
      const active =
        (!!activePetPath && normalizedPetPath === activePetPath) ||
        (!!activeCtPath && normalizedCtPath === activeCtPath);

      return {
        id: key,
        label: displayLabel,
        petPath: group.petPath,
        ctPath: group.ctPath,
        petCount: getDicomCount(group.petPath),
        ctCount: getDicomCount(group.ctPath),
        active,
      };
    })
    .sort((left, right) => {
      if (left.active !== right.active) {
        return left.active ? -1 : 1;
      }

      return left.label.localeCompare(right.label);
    });
};

const SeriesSelectorPanel: React.FC<SeriesSelectorPanelProps> = (props) => {
  const { selectedSeriesId, onSeriesChange } = props;
  const patientInfo = useAppSelector((state) => state.patient.patientInfo);
  const { inputPath, outputPath } = patientInfo;
  const [collapsed, setCollapsed] = useState(false);
  const seriesOptions = useMemo(
    () => discoverSeriesOptions(inputPath, outputPath),
    [inputPath, outputPath]
  );
  const defaultSelectedId =
    seriesOptions.find((series) => series.active)?.id || seriesOptions[0]?.id || "";
  const selectedId = selectedSeriesId || defaultSelectedId;

  const selectedSeries = seriesOptions.find((series) => series.id === selectedId);

  const selectSeries = (series: SeriesOption) => {
    onSeriesChange(series);
  };

  return (
    <div
      className={
        collapsed
          ? "seriesSelectorPanel collapsed"
          : "seriesSelectorPanel"
      }
    >
      <div className="seriesSelectorToolbar">
        <button
          type="button"
          className="seriesSelectorCollapse"
          onClick={() => setCollapsed((visible) => !visible)}
        >
          {collapsed ? "›" : "‹"}
        </button>
        <div className="seriesSelectorTitle">序列选择</div>
      </div>

      <div className="seriesSelectorContent">
        {seriesOptions.length ? (
          seriesOptions.map((series) => (
            <button
              type="button"
              key={series.id}
              className={
                series.id === selectedId
                  ? "seriesOption selected"
                  : "seriesOption"
              }
              onClick={() => selectSeries(series)}
            >
              <span className="seriesOptionName">
                {series.label}
                {series.active ? <em>当前</em> : null}
              </span>
              <span className="seriesOptionMeta">
                PET {series.petCount || "-"} / CT {series.ctCount || "-"}
              </span>
            </button>
          ))
        ) : (
          <div className="seriesSelectorEmpty">未识别到可选序列</div>
        )}
      </div>

      {selectedSeries ? (
        <div className="seriesSelectorDetail">
          <div>
            <span>PET</span>
            <strong>{getBaseName(selectedSeries.petPath) || "-"}</strong>
          </div>
          <div>
            <span>CT</span>
            <strong>{getBaseName(selectedSeries.ctPath) || "-"}</strong>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default SeriesSelectorPanel;
