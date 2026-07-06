const express = require('express')
const router = express.Router()
const connection = require('../db/db_connect')
const fs = require('fs')
const path = require('path')
const { countPositiveVoxels, readMaskFile, writeMaskFile } = require('../utils/niftiMask')

const localDataDir = path.join(__dirname, '..', 'data')
const localStudiesPath = path.join(localDataDir, 'local-studies.json')

function readLocalStudies() {
  try {
    if (!fs.existsSync(localStudiesPath)) {
      return []
    }

    return JSON.parse(fs.readFileSync(localStudiesPath, 'utf8'))
  } catch (error) {
    console.error('Failed to read local studies:', error)
    return []
  }
}

function writeLocalStudies(studies) {
  fs.mkdirSync(localDataDir, { recursive: true })
  fs.writeFileSync(localStudiesPath, JSON.stringify(studies, null, 2))
}

function upsertLocalStudy(study) {
  const studies = readLocalStudies()
  const index = studies.findIndex((item) => item.seriesId === study.seriesId)

  if (index >= 0) {
    studies[index] = { ...studies[index], ...study }
  } else {
    studies.push(study)
  }

  writeLocalStudies(studies)
}

function deleteLocalStudy(seriesId) {
  const studies = readLocalStudies()
  const pairPrefix = String(seriesId || '').replace(/_(PT|CT)$/, '')
  const nextStudies = studies.filter((item) => {
    if (item.seriesId === seriesId) {
      return false
    }

    return !pairPrefix || !String(item.seriesId || '').startsWith(`${pairPrefix}_`)
  })
  writeLocalStudies(nextStudies)
  return nextStudies.length !== studies.length
}

function formatListStudy(row) {
  const { seriesId, name, pID, sex, birthday, scanMode, scanTime, processingTime, inputPath, outputPath, flag, seriesDesc } = row
  let modifiedTime
  switch (flag) {
    case '0': modifiedTime = '处理中...'; break
    case '1': modifiedTime = processingTime; break
    case '2': modifiedTime = '处理错误,查看错误报告'; break
    case '3': modifiedTime = '请查看同序列PT目录'; break
    case '4': modifiedTime = '处理完成，传输中...'; break
    case '5': modifiedTime = '队列中...'; break
    case '6': modifiedTime = '本地导入'; break
    default: modifiedTime = '异常'; break
  }
  let pname = name
  if (pname === undefined || pname === '') {
    pname = '匿名'
  }

  return { seriesId, pname, pID, sex, birthday, scanMode, scanTime, inputPath, outputPath, modifiedTime, pflag: flag, seriesDesc }
}

function getLocalList({ curPage, sizePerPage, searchName }) {
  const low = (curPage - 1) * sizePerPage
  const normalizedSearch = String(searchName || '').toLowerCase()
  const studies = readLocalStudies()
    .filter((study) => !(study.flag === '3' && study.scanMode === 'CT'))
    .filter((study) => {
      if (!normalizedSearch) {
        return true
      }

      return ['seriesId', 'name', 'birthday', 'scanMode', 'scanTime', 'processingTime', 'seriesDesc']
        .some((key) => String(study[key] || '').toLowerCase().includes(normalizedSearch))
    })
    .sort((a, b) => String(b.seriesId || '').localeCompare(String(a.seriesId || '')))

  return [studies.slice(low, low + sizePerPage).map(formatListStudy), studies.length]
}

/* GET home page. */
router.get('/', function (req, res, next) {
  res.render('index', { title: 'Express' })
})

router.post('/list', function (req, res) {
  const { product, curPage, sizePerPage, searchName } = req.body
  const low = (curPage - 1) * sizePerPage
  let SQLgetInfo1, SQLgetInfo2

  if (!searchName) {
    SQLgetInfo1 = "select seriesId,name,sex,date_format(birthday,'%Y-%m-%d') birthday,scanMode,date_format(scanTime,'%Y-%m-%d') scanTime,date_format(processingTime,'%Y-%m-%d %H:%i') processingTime,seriesDesc,institution,inputPath,outputPath,pID,flag from " + product + " order by seriesId desc limit " + low + "," + sizePerPage
    SQLgetInfo2 = "select seriesId,name,sex,date_format(birthday,'%Y-%m-%d') birthday,scanMode,date_format(scanTime,'%Y-%m-%d') scanTime,date_format(processingTime,'%Y-%m-%d %H:%i') processingTime,seriesDesc,institution,inputPath,outputPath,pID,flag from " + product
  } else {
    SQLgetInfo1 = "select seriesId,name,sex,date_format(birthday,'%Y-%m-%d') birthday,scanMode,date_format(scanTime,'%Y-%m-%d') scanTime,date_format(processingTime,'%Y-%m-%d %H:%i') processingTime,seriesDesc,institution,inputPath,outputPath,pID,flag from " + product +
      " where seriesId like '%" + searchName + "%' or name like '%" + searchName + "%' or birthday like '%" + searchName + "%' or scanMode like '%" + searchName + "%' or scanTime like '%" + searchName + "%' or processingTime like '%" + searchName + "%' or seriesDesc like '%" + searchName + "%' order by seriesId desc limit " + low + "," + sizePerPage
    SQLgetInfo2 = "select seriesId,name,sex,date_format(birthday,'%Y-%m-%d') birthday,scanMode,date_format(scanTime,'%Y-%m-%d') scanTime,date_format(processingTime,'%Y-%m-%d %H:%i') processingTime,seriesDesc,institution,inputPath,outputPath,pID,flag from " + product +
      " where seriesId like '%" + searchName + "%' or name like '%" + searchName + "%' or birthday like '%" + searchName + "%' or scanMode like '%" + searchName + "%' or scanTime like '%" + searchName + "%' or processingTime like '%" + searchName + "%' or seriesDesc like '%" + searchName + "%'"
  }

  connection.query(SQLgetInfo1, function (error, results) {
    if (error) {
      console.error('Failed to fetch study list:', error)
      return res.send(getLocalList({ curPage, sizePerPage, searchName }))
    }

    const study_list = []
    for (let i = 0; i < results.length; ++i) {
      study_list.push(formatListStudy(results[i]))
    }

    connection.query(SQLgetInfo2, (countError, result) => {
      if (countError) {
        console.error('Failed to count study list:', countError)
        return res.send([study_list, study_list.length])
      }

      res.send([study_list, result.length])
    })
  })
})

router.post('/del', function (req, res) {
  const { seriesId } = req.body
  if (!seriesId) {
    return res.status(400).send({ error: 'Missing seriesId' })
  }

  const deletedLocally = deleteLocalStudy(seriesId)
  const tableName = 'NNUNET'
  const del_SQL = `delete from ${tableName} where seriesId = ?`
  connection.query(del_SQL, [seriesId], function (error, result) {
    if (error) {
      console.error('Failed to delete record:', error)
      return deletedLocally
        ? res.send({ success: '删除成功' })
        : res.status(500).send({ error: 'Failed to delete record' })
    }
    console.log(result)
    if (result.affectedRows > 0) {
      console.log('删除成功')
      res.send({ success: '删除成功' })
    } else if (deletedLocally) {
      res.send({ success: '删除成功' })
    } else {
      console.log('删除失败')
      res.status(404).send({ error: '未找到要删除的记录' })
    }
  })
})

function normalizeDicomDate(value) {
  if (!value) {
    return null
  }

  const raw = String(value).trim()
  if (/^\d{8}$/.test(raw)) {
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
  }

  return raw
}

function copyStudyFiles(filePaths, inputPath) {
  fs.mkdirSync(inputPath, { recursive: true })

  filePaths.forEach((filePath, index) => {
    const fileName = path.basename(filePath) || `dicom_${index}`
    let destination = path.join(inputPath, fileName)

    if (fs.existsSync(destination)) {
      destination = path.join(inputPath, `${index}_${fileName}`)
    }

    fs.copyFileSync(filePath, destination)
  })
}

router.post('/import-local', function (req, res) {
  const { product, studies } = req.body

  if (product !== 'NNUNET') {
    return res.status(400).send({ error: 'Unsupported product' })
  }

  if (!Array.isArray(studies) || !studies.length) {
    return res.status(400).send({ error: 'No studies to import' })
  }

  const imported = []
  const errors = []
  const warnings = []
  let pending = studies.length

  const finishOne = () => {
    pending -= 1
    if (pending === 0) {
      res.send({ imported, errors, warnings })
    }
  }

  studies.forEach((study) => {
    const {
      seriesId,
      seriesDesc,
      scanMode,
      scanTime,
      name,
      inputPath,
      pID,
      sex,
      birthday,
      flag,
      filePaths,
    } = study

    if (!seriesId || !inputPath || !Array.isArray(filePaths) || !filePaths.length) {
      errors.push({ seriesId: seriesId || '', error: 'Missing required study fields' })
      finishOne()
      return
    }

    try {
      copyStudyFiles(filePaths, inputPath)
    } catch (error) {
      errors.push({ seriesId, error: `Failed to copy files: ${error.message}` })
      finishOne()
      return
    }

    const sql = `
      insert into NNUNET
        (seriesDesc, scanMode, scanTime, name, seriesID, inputPath, pID, sex, birthday, flag)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      on duplicate key update
        seriesDesc = values(seriesDesc),
        scanMode = values(scanMode),
        scanTime = values(scanTime),
        name = values(name),
        inputPath = values(inputPath),
        pID = values(pID),
        sex = values(sex),
        birthday = values(birthday),
        flag = values(flag)
    `
    const values = [
      seriesDesc || '',
      scanMode || '',
      normalizeDicomDate(scanTime),
      name || '匿名',
      seriesId,
      inputPath,
      pID || '',
      sex || '',
      normalizeDicomDate(birthday),
      flag || '6',
    ]

    upsertLocalStudy({
      seriesDesc: seriesDesc || '',
      scanMode: scanMode || '',
      scanTime: normalizeDicomDate(scanTime),
      name: name || '匿名',
      seriesId,
      inputPath,
      outputPath: '',
      pID: pID || '',
      sex: sex || '',
      birthday: normalizeDicomDate(birthday),
      flag: flag || '6',
    })

    connection.query(sql, values, function (error) {
      if (error) {
        warnings.push({ seriesId, warning: `Saved locally; MySQL unavailable: ${error.message}` })
      }
      imported.push(seriesId)

      finishOne()
    })
  })
})

router.post('/getPath', (req, res) => {
  const { inputpath, outputpath } = req.body
  const result = []
  fs.readdir(outputpath, (err, files) => {
    if (err) {
      console.error('Failed to read output path:', err)
      res.status(500).send({ error: 'Failed to read output path' })
    } else {
      const arr = files.map(file => {
        return outputpath + '/' + file
      })
      res.send(arr)
    }
  })
})

router.get('/licenseVerify',(req,res)=>{
  
})

router.get('/study/:seriesId/segmentation', (req, res) => {
  const { outputPath } = req.query

  if (!outputPath) {
    return res.send({
      success: true,
      exists: false,
      source: 'none',
      message: 'Missing outputPath',
    })
  }

  const segmentationDir = path.join(outputPath, 'out', 'segmentation')
  const candidateFiles = [
    { source: 'doctor', filePath: path.join(segmentationDir, 'doctor_mask.nii.gz') },
    { source: 'algorithm', filePath: path.join(segmentationDir, 'algorithm_mask.nii.gz') },
  ]
  const parseErrors = []

  for (const candidate of candidateFiles) {
    if (!fs.existsSync(candidate.filePath)) {
      continue
    }

    try {
      const parsedMask = readMaskFile(fs.readFileSync(candidate.filePath))
      const positiveVoxelCount = countPositiveVoxels(parsedMask.scalarData)
      return res.send({
        success: true,
        exists: true,
        source: candidate.source,
        path: candidate.filePath,
        dimensions: parsedMask.dimensions,
        positiveVoxelCount,
        isEmptyMask: positiveVoxelCount === 0,
        scalarDataBase64: Buffer.from(parsedMask.scalarData).toString('base64'),
      })
    } catch (error) {
      parseErrors.push(`${candidate.source}: ${error.message}`)
    }
  }

  if (parseErrors.length) {
    return res.status(500).send({
      success: false,
      exists: false,
      source: 'error',
      message: parseErrors.join('; '),
    })
  }

  return res.send({
    success: true,
    exists: false,
    source: 'none',
    path: path.join(segmentationDir, 'algorithm_mask.nii.gz'),
    message: 'No segmentation file found',
  })
})

router.post('/study/:seriesId/segmentation', (req, res) => {
  const { outputPath, dimensions, spacing, origin, direction, scalarDataBase64 } = req.body

  if (!outputPath || !dimensions || !scalarDataBase64) {
    return res.status(400).send({ error: 'Missing required segmentation payload' })
  }

  const voxelCount = dimensions[0] * dimensions[1] * dimensions[2]
  const scalarData = Uint8Array.from(Buffer.from(scalarDataBase64, 'base64'))

  if (scalarData.length !== voxelCount) {
    return res.status(400).send({ error: 'Segmentation voxel count does not match dimensions' })
  }

  try {
    const segmentationDir = path.join(outputPath, 'out', 'segmentation')
    const doctorMaskPath = path.join(segmentationDir, 'doctor_mask.nii.gz')
    const positiveVoxelCount = countPositiveVoxels(scalarData)
    fs.mkdirSync(segmentationDir, { recursive: true })
    const fileBuffer = writeMaskFile({
      dimensions,
      spacing,
      origin,
      direction,
      scalarData,
    })
    fs.writeFileSync(doctorMaskPath, fileBuffer)
    return res.send({
      success: true,
      path: doctorMaskPath,
      positiveVoxelCount,
      isEmptyMask: positiveVoxelCount === 0,
    })
  } catch (error) {
    console.error('Failed to save segmentation:', error)
    return res.status(500).send({ error: 'Failed to save segmentation' })
  }
})

module.exports = router
