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

  const patientKey = String(pID || pname || 'anonymous')
  const studyDate = scanTime || ''
  const studyKey = `${patientKey}_${studyDate || 'unknown'}`
  const studyLabel = studyDate || '未知检查'

  return {
    seriesId,
    pname,
    pID,
    sex,
    birthday,
    scanMode,
    scanTime,
    inputPath,
    outputPath,
    modifiedTime,
    pflag: flag,
    seriesDesc,
    studyKey,
    studyLabel,
    studyDate,
  }
}

function matchesStudySearch(study, normalizedSearch) {
  if (!normalizedSearch) {
    return true
  }

  return ['seriesId', 'pname', 'pID', 'birthday', 'scanMode', 'scanTime', 'modifiedTime', 'seriesDesc', 'studyLabel']
    .some((key) => String(study[key] || '').toLowerCase().includes(normalizedSearch))
}

function buildPatientTree(studies, { curPage, sizePerPage, searchName }) {
  const normalizedSearch = String(searchName || '').toLowerCase()
  const low = (curPage - 1) * sizePerPage
  const filteredStudies = studies
    .map(formatListStudy)
    .filter((study) => matchesStudySearch(study, normalizedSearch))
    .sort((a, b) => String(b.seriesId || '').localeCompare(String(a.seriesId || '')))

  const patientMap = new Map()

  filteredStudies.forEach((study) => {
    const patientKey = String(study.pID || study.pname || 'anonymous')
    let patientGroup = patientMap.get(patientKey)

    if (!patientGroup) {
      patientGroup = {
        patientKey,
        pname: study.pname || '匿名',
        pID: study.pID || '',
        sex: study.sex || '',
        birthday: study.birthday || '',
        studyCount: 0,
        seriesCount: 0,
        studies: [],
      }
      patientMap.set(patientKey, patientGroup)
    }

    let studyGroup = patientGroup.studies.find((item) => item.studyKey === study.studyKey)
    if (!studyGroup) {
      studyGroup = {
        studyKey: study.studyKey,
        studyLabel: study.studyLabel,
        studyDate: study.studyDate,
        seriesCount: 0,
        seriesList: [],
      }
      patientGroup.studies.push(studyGroup)
    }

    studyGroup.seriesList.push(study)
    studyGroup.seriesCount += 1
    patientGroup.seriesCount += 1
  })

  const patientGroups = Array.from(patientMap.values()).map((patientGroup) => {
    patientGroup.studies.sort((a, b) => String(b.studyDate || '').localeCompare(String(a.studyDate || '')))
    patientGroup.studyCount = patientGroup.studies.length
    return patientGroup
  })

  patientGroups.sort((a, b) => {
    const latestA = a.studies[0] ? String(a.studies[0].studyDate || '') : ''
    const latestB = b.studies[0] ? String(b.studies[0].studyDate || '') : ''
    return latestB.localeCompare(latestA) || String(b.patientKey).localeCompare(String(a.patientKey))
  })

  return [patientGroups.slice(low, low + sizePerPage), patientGroups.length]
}

function getLocalList({ curPage, sizePerPage, searchName }) {
  const studies = readLocalStudies()
  return buildPatientTree(studies, { curPage, sizePerPage, searchName })
}

/* GET home page. */
router.get('/', function (req, res, next) {
  res.render('index', { title: 'Express' })
})

router.post('/list', function (req, res) {
  const { product, curPage, sizePerPage, searchName } = req.body
  let SQLgetInfo

  if (!searchName) {
    SQLgetInfo = "select seriesId,name,sex,date_format(birthday,'%Y-%m-%d') birthday,scanMode,date_format(scanTime,'%Y-%m-%d') scanTime,date_format(processingTime,'%Y-%m-%d %H:%i') processingTime,seriesDesc,institution,inputPath,outputPath,pID,flag from " + product
  } else {
    SQLgetInfo = "select seriesId,name,sex,date_format(birthday,'%Y-%m-%d') birthday,scanMode,date_format(scanTime,'%Y-%m-%d') scanTime,date_format(processingTime,'%Y-%m-%d %H:%i') processingTime,seriesDesc,institution,inputPath,outputPath,pID,flag from " + product +
      " where seriesId like '%" + searchName + "%' or name like '%" + searchName + "%' or pID like '%" + searchName + "%' or birthday like '%" + searchName + "%' or scanMode like '%" + searchName + "%' or scanTime like '%" + searchName + "%' or processingTime like '%" + searchName + "%' or seriesDesc like '%" + searchName + "%'"
  }

  connection.query(SQLgetInfo, function (error, results) {
    if (error) {
      console.error('Failed to fetch study list:', error)
      return res.send(getLocalList({ curPage, sizePerPage, searchName }))
    }

    res.send(buildPatientTree(results, { curPage, sizePerPage, searchName }))
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
  const { outputPath, source } = req.query

  if (!outputPath) {
    return res.send({
      success: true,
      exists: false,
      source: 'none',
      message: 'Missing outputPath',
    })
  }

  const segmentationDir = path.join(outputPath, 'out', 'segmentation')
  const doctorCandidate = { source: 'doctor', filePath: path.join(segmentationDir, 'doctor_mask.nii.gz') }
  const algorithmCandidate = { source: 'algorithm', filePath: path.join(segmentationDir, 'algorithm_mask.nii.gz') }
  let candidateFiles = [
    doctorCandidate,
    algorithmCandidate,
  ]

  if (source === 'algorithm') {
    candidateFiles = [algorithmCandidate]
  } else if (source === 'doctor') {
    candidateFiles = [doctorCandidate]
  }

  const parseErrors = []

  for (const candidate of candidateFiles) {
    if (!fs.existsSync(candidate.filePath)) {
      continue
    }

    try {
      const parsedMask = readMaskFile(fs.readFileSync(candidate.filePath), {
        preserveLabels: true,
      })
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
    path: source === 'doctor' ? doctorCandidate.filePath : algorithmCandidate.filePath,
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

router.post('/study/:seriesId/segmentation/export', (req, res) => {
  const { exportPath, dimensions, spacing, origin, direction, scalarDataBase64 } = req.body

  if (!exportPath || !dimensions || !scalarDataBase64) {
    return res.status(400).send({ error: 'Missing required segmentation export payload' })
  }

  const voxelCount = dimensions[0] * dimensions[1] * dimensions[2]
  const scalarData = Uint8Array.from(Buffer.from(scalarDataBase64, 'base64'))

  if (scalarData.length !== voxelCount) {
    return res.status(400).send({ error: 'Segmentation voxel count does not match dimensions' })
  }

  try {
    const safeExportPath = String(exportPath).endsWith('.nii.gz')
      ? String(exportPath)
      : `${exportPath}.nii.gz`
    const positiveVoxelCount = countPositiveVoxels(scalarData)
    const fileBuffer = writeMaskFile({
      dimensions,
      spacing,
      origin,
      direction,
      scalarData,
    })

    fs.mkdirSync(path.dirname(safeExportPath), { recursive: true })
    fs.writeFileSync(safeExportPath, fileBuffer)

    return res.send({
      success: true,
      path: safeExportPath,
      positiveVoxelCount,
      isEmptyMask: positiveVoxelCount === 0,
    })
  } catch (error) {
    console.error('Failed to export segmentation:', error)
    return res.status(500).send({ error: 'Failed to export segmentation' })
  }
})

module.exports = router
