import type { lesionSheetEntry, lesionSheetMeta } from "../../../types";
import { safeWindowRequire } from "../../../utils/electron";

const fs = safeWindowRequire ? safeWindowRequire("fs") : null;
const path = safeWindowRequire ? safeWindowRequire("path") : null;
const xlsx = safeWindowRequire ? safeWindowRequire("node-xlsx") : null;

const DEFAULT_LESION_HEADER = [
  "编号",
  "病灶标签",
  "中心索引 [x, y, z]",
  "中心位置 [x, y, z]",
  "范围 [dx, dy, dz]",
  "体积",
  "SUV Max",
  "SUV Mean",
  "SUV Std",
  "CT Centroid",
  "CT Min",
  "CT Max",
  "CT Mean",
  "CT Std",
  "所在区域",
  "调试信息",
  "Homogeneity",
];

interface LesionMaskStat {
  lesionLabel: string;
  centerIndex: string;
  centerPosition: string;
  range: string;
  volume: string;
  suvMax?: string;
  suvMean?: string;
  suvStd?: string;
  homogeneity?: string;
  ctCentroid?: string;
  ctMin?: string;
  ctMax?: string;
  ctMean?: string;
  ctStd?: string;
  debugInfo?: string;
  voxelCount: number;
}

const createEmptyMeta = (): lesionSheetMeta => ({
  sourceType: "none",
  sourcePath: "",
  cachePath: "",
  templatePath: "",
  templateExt: "",
  templateFileName: "",
  templateSheetName: "",
  importedAt: "",
});

const createEmptyLesionSheetEntry = (): lesionSheetEntry => ({
  data: [],
  name: "",
  header: [...DEFAULT_LESION_HEADER],
  doctorData: [],
  meta: createEmptyMeta(),
});

const normalizeTextValue = (value: unknown) => {
  if (value === undefined || value === null) {
    return "";
  }

  return `${value}`;
};

const getSegmentationDir = (effectiveOutputPath: string) =>
  path ? path.join(effectiveOutputPath, "out", "segmentation") : "";

const getDoctorMaskPath = (effectiveOutputPath: string) =>
  path ? path.join(getSegmentationDir(effectiveOutputPath), "doctor_mask.nii.gz") : "";

const getAlgorithmMaskPath = (effectiveOutputPath: string) =>
  path ? path.join(getSegmentationDir(effectiveOutputPath), "algorithm_mask.nii.gz") : "";

const getAlgorithmReportMetaPath = (effectiveOutputPath: string) =>
  path ? path.join(getSegmentationDir(effectiveOutputPath), "algorithm_lesion_report.meta.json") : "";

const getDoctorReportMetaPath = (effectiveOutputPath: string) =>
  path ? path.join(getSegmentationDir(effectiveOutputPath), "doctor_lesion_report.meta.json") : "";

const getDoctorReportXlsxPath = (effectiveOutputPath: string) =>
  path ? path.join(getSegmentationDir(effectiveOutputPath), "doctor_lesion_report.xlsx") : "";

const getAlgorithmImportsDir = (effectiveOutputPath: string) =>
  path ? path.join(getSegmentationDir(effectiveOutputPath), "algorithm_imports") : "";

const createHeaderIndex = (header?: any[]) =>
  (header || []).reduce<Record<string, number>>((indexMap, name, index) => {
    const normalized = normalizeTextValue(name).trim();

    if (normalized) {
      indexMap[normalized] = index;
    }

    return indexMap;
  }, {});

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

const readLesionWorkbookInfo = (filePath: string) => {
  if (!xlsx || !fs || !path || !fs.existsSync(filePath)) {
    return { sheetName: "", rows: [] as any[] };
  }

  const firstSheet = xlsx.parse(filePath)[0];
  return {
    sheetName: firstSheet?.name || "",
    rows: firstSheet?.data || [],
  };
};

const normalizeImportedRows = (rows: any[]) => {
  if (!rows.length) {
    return [];
  }

  const headerRow = Array.isArray(rows[0]) ? rows[0] : DEFAULT_LESION_HEADER;
  const headerIndex = createHeaderIndex(headerRow);
  const dataRows = Array.isArray(rows[0]) ? rows.slice(1) : rows;

  return dataRows.map((row: any, index: number) => {
    if (Array.isArray(row)) {
      return [
        normalizeTextValue(
          getCellByHeader(row, headerIndex, ["编号", "病灶ID", "id"], 0) || row[0]
        ) || `A-${index + 1}`,
        normalizeTextValue(
          getCellByHeader(row, headerIndex, ["病灶标签", "标签", "lesionLabel"], 1)
        ),
        normalizeTextValue(
          getCellByHeader(
            row,
            headerIndex,
            ["中心索引 [x, y, z]", "中心索引", "imageIndexs"],
            2
          )
        ),
        normalizeTextValue(
          getCellByHeader(row, headerIndex, ["中心位置 [x, y, z]", "中心位置"], 3)
        ),
        normalizeTextValue(
          getCellByHeader(row, headerIndex, ["范围 [dx, dy, dz]", "范围"], 4)
        ),
        normalizeTextValue(getCellByHeader(row, headerIndex, ["体积", "volume"], 5)),
        normalizeTextValue(
          getCellByHeader(row, headerIndex, ["SUV Max", "SUVmax", "suvMax"], 6)
        ),
        normalizeTextValue(
          getCellByHeader(row, headerIndex, ["SUV Mean", "SUVmean", "suvMean"], 7)
        ),
        normalizeTextValue(
          getCellByHeader(row, headerIndex, ["SUV Std", "SUVstd", "suvStd"], 8)
        ),
        normalizeTextValue(getCellByHeader(row, headerIndex, ["CT Centroid", "ctCentroid"], 9)),
        normalizeTextValue(getCellByHeader(row, headerIndex, ["CT Min", "ctMin"], 10)),
        normalizeTextValue(getCellByHeader(row, headerIndex, ["CT Max", "ctMax"], 11)),
        normalizeTextValue(getCellByHeader(row, headerIndex, ["CT Mean", "ctMean"], 12)),
        normalizeTextValue(getCellByHeader(row, headerIndex, ["CT Std", "ctStd"], 13)),
        normalizeTextValue(
          getCellByHeader(row, headerIndex, ["所在区域", "区域", "部位"], 14)
        ),
        normalizeTextValue(getCellByHeader(row, headerIndex, ["调试信息", "debugInfo"], 15)),
        normalizeTextValue(getCellByHeader(row, headerIndex, ["Homogeneity", "homogeneity"], 16)),
      ];
    }

    return [
      normalizeTextValue(row.id || row.lesionId || `A-${index + 1}`),
      normalizeTextValue(row.lesionLabel || row.label || row.segmentIndex || ""),
      normalizeTextValue(row.imageIndexs || row.imageIndexes || row.indexes || ""),
      normalizeTextValue(row.centerPosition || row.worldCenter || ""),
      normalizeTextValue(row.range || row.extent || ""),
      normalizeTextValue(row.volume || row.volumeMl || ""),
      normalizeTextValue(row.suvMax || row.SUVmax || row.suv_max || ""),
      normalizeTextValue(row.suvMean || row.SUVmean || row.suv_mean || ""),
      normalizeTextValue(row.suvStd || row.SUVstd || row.suv_std || ""),
      normalizeTextValue(row.ctCentroid || row.CTCentroid || row.ct_centroid || ""),
      normalizeTextValue(row.ctMin || row.CTMin || row.ct_min || ""),
      normalizeTextValue(row.ctMax || row.CTMax || row.ct_max || ""),
      normalizeTextValue(row.ctMean || row.CTMean || row.ct_mean || ""),
      normalizeTextValue(row.ctStd || row.CTStd || row.ct_std || ""),
      normalizeTextValue(row.area || row.location || row.part || ""),
      normalizeTextValue(row.debugInfo || row.debug || ""),
      normalizeTextValue(row.homogeneity || row.Homogeneity || ""),
    ];
  });
};

const cloneRows = (rows: any[]) => rows.map((row) => (Array.isArray(row) ? [...row] : row));

const writeJson = (filePath: string, data: unknown) => {
  if (!fs || !path) {
    throw new Error("Local file cache is unavailable");
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
};

const readJson = (filePath: string) => JSON.parse(fs.readFileSync(filePath, "utf8"));

const setManagedCell = (
  row: any[],
  headerIndex: Record<string, number>,
  names: string[],
  fallbackIndex: number,
  value: string
) => {
  const headerName = names.find((name) => headerIndex[name] !== undefined);
  const index = headerName ? headerIndex[headerName] : fallbackIndex;

  while (row.length <= index) {
    row.push("");
  }

  row[index] = value;
};

const fillManagedFields = (row: any[], headerIndex: Record<string, number>, lesionRow: string[]) => {
  setManagedCell(row, headerIndex, ["编号", "病灶ID", "id"], 0, normalizeTextValue(lesionRow[0]));
  setManagedCell(
    row,
    headerIndex,
    ["病灶标签", "标签", "lesionLabel"],
    1,
    normalizeTextValue(lesionRow[1])
  );
  setManagedCell(
    row,
    headerIndex,
    ["中心索引 [x, y, z]", "中心索引", "imageIndexs"],
    2,
    normalizeTextValue(lesionRow[2])
  );
  setManagedCell(
    row,
    headerIndex,
    ["SUV Max", "SUVmax", "suvMax"],
    6,
    normalizeTextValue(lesionRow[6])
  );
  setManagedCell(
    row,
    headerIndex,
    ["SUV Mean", "SUVmean", "suvMean"],
    7,
    normalizeTextValue(lesionRow[7])
  );
  setManagedCell(row, headerIndex, ["体积", "volume"], 5, normalizeTextValue(lesionRow[5]));
  setManagedCell(
    row,
    headerIndex,
    ["SUV Std", "SUVstd", "suvStd"],
    8,
    normalizeTextValue(lesionRow[8])
  );
  setManagedCell(
    row,
    headerIndex,
    ["Homogeneity", "homogeneity"],
    16,
    normalizeTextValue(lesionRow[16])
  );
  setManagedCell(
    row,
    headerIndex,
    ["CT Centroid", "ctCentroid"],
    9,
    normalizeTextValue(lesionRow[9])
  );
  setManagedCell(row, headerIndex, ["CT Min", "ctMin"], 10, normalizeTextValue(lesionRow[10]));
  setManagedCell(row, headerIndex, ["CT Max", "ctMax"], 11, normalizeTextValue(lesionRow[11]));
  setManagedCell(row, headerIndex, ["CT Mean", "ctMean"], 12, normalizeTextValue(lesionRow[12]));
  setManagedCell(row, headerIndex, ["CT Std", "ctStd"], 13, normalizeTextValue(lesionRow[13]));
  setManagedCell(
    row,
    headerIndex,
    ["所在区域", "区域", "部位"],
    14,
    normalizeTextValue(lesionRow[14])
  );
  setManagedCell(
    row,
    headerIndex,
    ["中心位置 [x, y, z]", "中心位置"],
    3,
    normalizeTextValue(lesionRow[3])
  );
  setManagedCell(
    row,
    headerIndex,
    ["范围 [dx, dy, dz]", "范围"],
    4,
    normalizeTextValue(lesionRow[4])
  );
  setManagedCell(row, headerIndex, ["调试信息", "debugInfo"], 15, normalizeTextValue(lesionRow[15]));
};

const getLesionLabelFromRow = (row: string[]) => normalizeTextValue(row[1]).trim();

const applyStatToRow = (row: string[], stat: LesionMaskStat) => {
  const nextRow = [...row];
  while (nextRow.length < DEFAULT_LESION_HEADER.length) {
    nextRow.push("");
  }

  nextRow[1] = stat.lesionLabel;
  nextRow[2] = stat.centerIndex;
  nextRow[3] = stat.centerPosition;
  nextRow[4] = stat.range;
  nextRow[5] = stat.volume;
  nextRow[6] = stat.suvMax || "";
  nextRow[7] = stat.suvMean || "";
  nextRow[8] = stat.suvStd || "";
  nextRow[9] = stat.ctCentroid || "";
  nextRow[10] = stat.ctMin || "";
  nextRow[11] = stat.ctMax || "";
  nextRow[12] = stat.ctMean || "";
  nextRow[13] = stat.ctStd || "";
  nextRow[15] = stat.debugInfo || "";
  nextRow[16] = stat.homogeneity || "";
  return nextRow;
};

const createDoctorRowFromStat = (stat: LesionMaskStat, fallbackId: number) =>
  applyStatToRow(
    [
      normalizeTextValue(fallbackId),
      stat.lesionLabel,
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
      "",
    ],
    stat
  );

const applyMaskStatsToSheet = (
  sheet: lesionSheetEntry,
  maskStats: LesionMaskStat[] = [],
  target?: { lesionId?: string; lesionLabel?: string }
): lesionSheetEntry => {
  const statsByLabel = new Map(
    maskStats
      .filter((stat) => normalizeTextValue(stat.lesionLabel).trim())
      .map((stat) => [normalizeTextValue(stat.lesionLabel).trim(), stat])
  );
  const targetId = normalizeTextValue(target?.lesionId).trim();
  const targetLabel = normalizeTextValue(target?.lesionLabel).trim();
  const candidateStats = targetLabel
    ? maskStats.filter(
        (stat) => normalizeTextValue(stat.lesionLabel).trim() === targetLabel
      )
    : maskStats;
  const statsToApply = targetId || targetLabel ? candidateStats.slice(0, 1) : [];

  if (!statsByLabel.size || !statsToApply.length) {
    return sheet;
  }

  const usedStatLabels = new Set<string>();
  const nextDoctorData = (sheet.doctorData || []).map((row) => {
    const rowId = normalizeTextValue(row[0]).trim();
    const rowLabel = getLesionLabelFromRow(row);
    const stat =
      (targetId && rowId === targetId ? statsToApply[0] : null) ||
      (targetLabel && rowLabel === targetLabel ? statsToApply[0] : null);
    if (!stat) {
      return row;
    }

    usedStatLabels.add(normalizeTextValue(stat.lesionLabel).trim());
    return applyStatToRow(row, stat);
  });

  const sourceAlgorithmRow =
    targetId || targetLabel
      ? sheet.data.find((row) => {
          const rowId = normalizeTextValue(row[0]).trim();
          const rowLabel = getLesionLabelFromRow(row);
          return (targetId && rowId === targetId) || (targetLabel && rowLabel === targetLabel);
        })
      : null;
  const nextIdStart = sheet.data.length + nextDoctorData.length + 1;
  const createdDoctorRows = statsToApply
    .filter((stat) => !usedStatLabels.has(normalizeTextValue(stat.lesionLabel).trim()))
    .map((stat, index) => {
      const baseRow = sourceAlgorithmRow
        ? [...sourceAlgorithmRow]
        : createDoctorRowFromStat(stat, nextIdStart + index);
      baseRow[0] = targetId && !sourceAlgorithmRow ? targetId : `D-${nextIdStart + index}`;
      return applyStatToRow(baseRow, stat);
    });

  return {
    ...sheet,
    header: sheet.header?.length ? sheet.header : [...DEFAULT_LESION_HEADER],
    data: sheet.data,
    doctorData: dedupeDoctorRowsByLabel([...nextDoctorData, ...createdDoctorRows]),
  };
};

const buildDoctorReportRows = (
  sheet: lesionSheetEntry,
  templateRows: any[] = []
) => {
  const safeTemplateRows = cloneRows(templateRows);
  const headerRow =
    Array.isArray(safeTemplateRows[0]) && safeTemplateRows[0].length
      ? [...safeTemplateRows[0]]
      : [...(sheet.header?.length ? sheet.header : DEFAULT_LESION_HEADER)];
  const headerIndex = createHeaderIndex(headerRow);
  const outputRows = [headerRow];

  sheet.data.forEach((lesionRow, index) => {
    const sourceRow = Array.isArray(safeTemplateRows[index + 1])
      ? [...safeTemplateRows[index + 1]]
      : Array.from({ length: headerRow.length }, () => "");
    if (!Array.isArray(safeTemplateRows[index + 1])) {
      fillManagedFields(sourceRow, headerIndex, lesionRow);
    }
    outputRows.push(sourceRow);
  });

  (sheet.doctorData || []).forEach((lesionRow) => {
    const doctorRow = Array.from({ length: headerRow.length }, () => "");
    fillManagedFields(doctorRow, headerIndex, lesionRow);
    outputRows.push(doctorRow);
  });

  return outputRows;
};

const writeDoctorReportXlsx = (
  filePath: string,
  sheet: lesionSheetEntry,
  templateRows: any[] = [],
  sheetName = "lesion_report"
) => {
  if (!xlsx || !fs || !path) {
    throw new Error("Excel writer is unavailable");
  }

  const rows = buildDoctorReportRows(sheet, templateRows);
  const workbook = xlsx.build([{ name: sheetName, data: rows }]);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, workbook);
  return rows;
};

const readTemplateRows = (filePath: string) => {
  if (!fs || !filePath || !fs.existsSync(filePath)) {
    return [];
  }

  return readLesionRows(filePath);
};

const createSheetEntry = (
  rows: any[],
  options: {
    name: string;
    meta?: lesionSheetMeta;
    doctorData?: string[][];
  }
) => ({
  data: normalizeImportedRows(rows),
  name: options.name,
  header: [...DEFAULT_LESION_HEADER],
  doctorData: options.doctorData || [],
  meta: options.meta || createEmptyMeta(),
});

const dedupeDoctorRowsByLabel = (rows: string[][] = []) => {
  const rowsByLabel = new Map<string, string[]>();

  rows.forEach((row) => {
    const label = getLesionLabelFromRow(row);
    if (!label) {
      return;
    }

    rowsByLabel.set(label, row);
  });

  return Array.from(rowsByLabel.values());
};

const loadCachedLesionSheet = (effectiveOutputPath: string) => {
  if (!fs || !path || !effectiveOutputPath) {
    return createEmptyLesionSheetEntry();
  }

  const doctorMaskPath = getDoctorMaskPath(effectiveOutputPath);
  const doctorMetaPath = getDoctorReportMetaPath(effectiveOutputPath);
  const doctorXlsxPath = getDoctorReportXlsxPath(effectiveOutputPath);

  if (fs.existsSync(doctorMaskPath)) {
    if (fs.existsSync(doctorMetaPath)) {
      try {
        const doctorMeta = readJson(doctorMetaPath);
        return {
          data: Array.isArray(doctorMeta.algorithmData) ? doctorMeta.algorithmData : [],
          name: doctorMeta.name || "doctor_lesion_report.xlsx",
          header: Array.isArray(doctorMeta.header) ? doctorMeta.header : [...DEFAULT_LESION_HEADER],
          doctorData: dedupeDoctorRowsByLabel(
            Array.isArray(doctorMeta.doctorData) ? doctorMeta.doctorData : []
          ),
          meta: {
            ...createEmptyMeta(),
            ...(doctorMeta.meta || {}),
            sourceType: "doctor",
            cachePath: doctorXlsxPath,
          },
        };
      } catch (error) {
        // Fall through to doctor xlsx parsing.
      }
    }

    if (fs.existsSync(doctorXlsxPath)) {
      const rows = readLesionRows(doctorXlsxPath);
      return createSheetEntry(rows, {
        name: path.basename(doctorXlsxPath),
        meta: {
          ...createEmptyMeta(),
          sourceType: "doctor",
          sourcePath: doctorXlsxPath,
          cachePath: doctorXlsxPath,
          templatePath: doctorXlsxPath,
          templateExt: ".xlsx",
          templateFileName: path.basename(doctorXlsxPath),
          templateSheetName: "lesion_report",
          importedAt: "",
        },
      });
    }
  }

  const algorithmMetaPath = getAlgorithmReportMetaPath(effectiveOutputPath);

  if (fs.existsSync(algorithmMetaPath)) {
    try {
      const algorithmMeta = readJson(algorithmMetaPath);
      const reportPath = algorithmMeta.cachePath || algorithmMeta.sourcePath;
      if (reportPath && fs.existsSync(reportPath)) {
        const rows = readLesionRows(reportPath);
        return createSheetEntry(rows, {
          name: algorithmMeta.templateFileName || path.basename(reportPath),
          meta: {
            ...createEmptyMeta(),
            ...algorithmMeta,
            sourceType: "algorithm",
            cachePath: reportPath,
          },
        });
      }
    } catch (error) {
      // Fall through to legacy report.
    }
  }

  const legacyReportPath = path.join(effectiveOutputPath, "out", "report.xlsx");
  if (fs.existsSync(legacyReportPath)) {
    const rows = readLesionRows(legacyReportPath);
    return createSheetEntry(rows, {
      name: path.basename(legacyReportPath),
      meta: {
        ...createEmptyMeta(),
        sourceType: "legacy",
        sourcePath: legacyReportPath,
        cachePath: legacyReportPath,
        templatePath: legacyReportPath,
        templateExt: ".xlsx",
        templateFileName: path.basename(legacyReportPath),
        templateSheetName: "report",
        importedAt: "",
      },
    });
  }

  return createEmptyLesionSheetEntry();
};

export {
  DEFAULT_LESION_HEADER,
  buildDoctorReportRows,
  createEmptyLesionSheetEntry,
  createEmptyMeta,
  createHeaderIndex,
  createSheetEntry,
  getAlgorithmImportsDir,
  getAlgorithmMaskPath,
  getAlgorithmReportMetaPath,
  getCellByHeader,
  getDoctorMaskPath,
  getDoctorReportMetaPath,
  getDoctorReportXlsxPath,
  getSegmentationDir,
  loadCachedLesionSheet,
  normalizeImportedRows,
  normalizeTextValue,
  applyMaskStatsToSheet,
  readLesionRows,
  readLesionWorkbookInfo,
  readTemplateRows,
  writeDoctorReportXlsx,
  writeJson,
};
export type { LesionMaskStat };
