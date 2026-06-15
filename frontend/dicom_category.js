const dicomParser = require('dicom-parser');

// return the 2d array for each size and the index
function dicom_category(arr) {
  let dcmsize = []
  let arrays = []
  for (let i = 0; i < arr.length; i++) {
    let rows = dicomParser.parseDicom(arr[i]).string('x0020000e')
    // let cols = dicomParser.parseDicom(arr[i]).uint16('x00280011');
    if (!(dcmsize.includes(rows))) {
      dcmsize.push(rows)
    }
  }
  // console.log(dcmsize)
  for (let i = 0; i < dcmsize.length; i++) {
    let a = []
    for (let j = 0; j < arr.length; j++) {
      if (dicomParser.parseDicom(arr[j]).string('x0020000e') == dcmsize[i]) {
        a.push(j)
      }
    }
    arrays.push(a)
  }
  // console.log(arrays)
  return arrays
}

module.exports.dicom_category = dicom_category