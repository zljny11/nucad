const express = require('express')
const router = express.Router()
const connection = require('../db/db_connect')
const fs = require('fs')
const path = require('path')
const { countPositiveVoxels, readMaskFile, writeMaskFile } = require('../utils/niftiMask')

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
      return res.send([[], 0])
    }

    const study_list = []
    for (let i = 0; i < results.length; ++i) {
      const { seriesId, name, pID, sex, birthday, scanMode, scanTime, processingTime, inputPath, outputPath, flag, seriesDesc } = results[i]
      let modifiedTime
      switch (results[i].flag) {
        case '0': modifiedTime = '处理中...'; break
        case '1': modifiedTime = processingTime; break
        case '2': modifiedTime = '处理错误,查看错误报告'; break
        case '3': modifiedTime = '请查看同序列PT目录'; break
        case '4': modifiedTime = '处理完成，传输中...'; break
        case '5': modifiedTime = '队列中...'; break
        default: modifiedTime = '异常'; break
      }
      let pname = name
      if (pname === undefined || pname === '') {
        pname = '匿名'
      }
      study_list.push({ seriesId, pname, pID, sex, birthday, scanMode, scanTime, inputPath, outputPath, modifiedTime, pflag: flag, seriesDesc })
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
  const tableName = 'NNUNET'
  const del_SQL = "delete from " + tableName + " where (seriesId = '" + seriesId + "');"
  connection.query(del_SQL, function (error, result) {
    if (error) {
      console.error('Failed to delete record:', error)
      return res.status(500).send({ error: 'Failed to delete record' })
    }
    console.log(result)
    if (result.affectedRows > 0) {
      console.log('删除成功')
      res.send({ success: '删除成功' })
    } else {
      console.log('删除失败')
    }
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
