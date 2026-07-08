const zlib = require("zlib");

const NIFTI_HEADER_SIZE = 348;
const NIFTI_VOX_OFFSET = 352;
const GZIP_MAGIC_1 = 0x1f;
const GZIP_MAGIC_2 = 0x8b;

function isGzipped(buffer) {
  return buffer[0] === GZIP_MAGIC_1 && buffer[1] === GZIP_MAGIC_2;
}

function getDataView(buffer) {
  return new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

function getEndian(dataView) {
  if (dataView.getInt32(0, true) === NIFTI_HEADER_SIZE) {
    return true;
  }
  if (dataView.getInt32(0, false) === NIFTI_HEADER_SIZE) {
    return false;
  }
  throw new Error("Unsupported NIfTI header");
}

function normalizeMaskData(rawBuffer, datatype, count, littleEndian, options = {}) {
  const dataView = getDataView(rawBuffer);
  const maskData = new Uint8Array(count);
  const preserveLabels = options.preserveLabels === true;
  let readValue;

  switch (datatype) {
    case 2:
      readValue = (index) => dataView.getUint8(index);
      break;
    case 4:
      readValue = (index) => dataView.getInt16(index, littleEndian);
      break;
    case 8:
      readValue = (index) => dataView.getInt32(index, littleEndian);
      break;
    case 16:
      readValue = (index) => dataView.getFloat32(index, littleEndian);
      break;
    case 256:
      readValue = (index) => dataView.getInt8(index);
      break;
    case 512:
      readValue = (index) => dataView.getUint16(index, littleEndian);
      break;
    case 768:
      readValue = (index) => dataView.getUint32(index, littleEndian);
      break;
    default:
      throw new Error(`Unsupported NIfTI datatype: ${datatype}`);
  }

  const bytesPerValue = {
    2: 1,
    4: 2,
    8: 4,
    16: 4,
    256: 1,
    512: 2,
    768: 4,
  }[datatype];

  for (let i = 0; i < count; i += 1) {
    const value = readValue(i * bytesPerValue);
    if (preserveLabels) {
      maskData[i] = Math.max(0, Math.min(255, Math.round(value)));
    } else {
      maskData[i] = value > 0 ? 1 : 0;
    }
  }

  return maskData;
}

function readMaskFile(fileBuffer, options = {}) {
  const inflated = isGzipped(fileBuffer) ? zlib.gunzipSync(fileBuffer) : fileBuffer;
  const dataView = getDataView(inflated);
  const littleEndian = getEndian(dataView);
  const dimensions = [
    dataView.getInt16(42, littleEndian),
    dataView.getInt16(44, littleEndian),
    dataView.getInt16(46, littleEndian),
  ];
  const datatype = dataView.getInt16(70, littleEndian);
  const voxOffset = Math.floor(dataView.getFloat32(108, littleEndian)) || NIFTI_VOX_OFFSET;
  const voxelCount = dimensions[0] * dimensions[1] * dimensions[2];

  if (!dimensions.every((value) => Number.isFinite(value) && value > 0)) {
    throw new Error("Invalid NIfTI dimensions");
  }

  if (inflated.byteLength <= voxOffset) {
    throw new Error("Invalid NIfTI voxel data offset");
  }

  const rawBuffer = inflated.subarray(voxOffset);
  const scalarData = normalizeMaskData(
    rawBuffer,
    datatype,
    voxelCount,
    littleEndian,
    options
  );

  return {
    dimensions,
    scalarData,
  };
}

function writeMaskFile({ dimensions, spacing, origin, direction, scalarData }) {
  const header = Buffer.alloc(NIFTI_VOX_OFFSET, 0);
  const dataView = new DataView(header.buffer, header.byteOffset, header.byteLength);
  const safeSpacing = Array.isArray(spacing) && spacing.length >= 3 ? spacing : [1, 1, 1];
  const safeOrigin = Array.isArray(origin) && origin.length >= 3 ? origin : [0, 0, 0];
  const safeDirection =
    Array.isArray(direction) && direction.length >= 9
      ? direction
      : [1, 0, 0, 0, 1, 0, 0, 0, 1];

  dataView.setInt32(0, NIFTI_HEADER_SIZE, true);
  dataView.setInt16(40, 3, true);
  dataView.setInt16(42, dimensions[0], true);
  dataView.setInt16(44, dimensions[1], true);
  dataView.setInt16(46, dimensions[2], true);
  dataView.setInt16(48, 1, true);
  dataView.setInt16(50, 1, true);
  dataView.setInt16(52, 1, true);
  dataView.setInt16(54, 1, true);
  dataView.setInt16(70, 2, true);
  dataView.setInt16(72, 8, true);
  dataView.setFloat32(76, 0, true);
  dataView.setFloat32(80, safeSpacing[0], true);
  dataView.setFloat32(84, safeSpacing[1], true);
  dataView.setFloat32(88, safeSpacing[2], true);
  dataView.setFloat32(92, 1, true);
  dataView.setFloat32(108, NIFTI_VOX_OFFSET, true);
  dataView.setFloat32(112, 1, true);
  dataView.setInt16(252, 0, true);
  dataView.setInt16(254, 1, true);
  dataView.setUint8(123, 2);
  dataView.setFloat32(280, safeDirection[0] * safeSpacing[0], true);
  dataView.setFloat32(284, safeDirection[1] * safeSpacing[1], true);
  dataView.setFloat32(288, safeDirection[2] * safeSpacing[2], true);
  dataView.setFloat32(292, safeOrigin[0], true);
  dataView.setFloat32(296, safeDirection[3] * safeSpacing[0], true);
  dataView.setFloat32(300, safeDirection[4] * safeSpacing[1], true);
  dataView.setFloat32(304, safeDirection[5] * safeSpacing[2], true);
  dataView.setFloat32(308, safeOrigin[1], true);
  dataView.setFloat32(312, safeDirection[6] * safeSpacing[0], true);
  dataView.setFloat32(316, safeDirection[7] * safeSpacing[1], true);
  dataView.setFloat32(320, safeDirection[8] * safeSpacing[2], true);
  dataView.setFloat32(324, safeOrigin[2], true);
  header.write("n+1\0", 344, "ascii");

  return zlib.gzipSync(Buffer.concat([header, Buffer.from(scalarData)]));
}

function countPositiveVoxels(scalarData) {
  let count = 0;

  for (let i = 0; i < scalarData.length; i += 1) {
    if (scalarData[i] > 0) {
      count += 1;
    }
  }

  return count;
}

module.exports = {
  countPositiveVoxels,
  readMaskFile,
  writeMaskFile,
};
