const childprocess = require("child_process");
const errorLogs = require('./error_log.js');

const Store = require('electron-store');
const store = new Store();
const userData = store.get('address')

function sendback(ipnum, remoteipinfo, dicom_type, callback) {
  for (var j = 0; j < ipnum; j++) {
    let info_split = remoteipinfo[j].split(';');
    var remote_ip = info_split[0];
    var remote_port = info_split[1];
    var remote_ae = info_split[2];
    let sendback_cmd;
    if (dicom_type.indexOf('input') == -1) {
      sendback_cmd = 'storescu -d ' + remote_ip + ' ' + remote_port + ' ' + userData + '/config/' + dicom_type + '/*.dcm -aec ' + remote_ae + ' -aet myaet';
    }
    else {
      sendback_cmd = 'storescu -d ' + remote_ip + ' ' + remote_port + ' ' + userData + '/config/' + dicom_type + '/*.MR -aec ' + remote_ae + ' -aet myaet';
    }
    // console.log(sendback_cmd)
    // execSync change to exec (not installed)
    let sendProcess = childprocess.exec(sendback_cmd, {}, (error) => {
      if (error) {
        console.error(`DICOM Transfer Error: ${error}`);
        errorLogs.errorMessage('storescu', error.toString(), ipnum, remoteipinfo);
      }
      else {
        callback();
      }
    });
  }
}

module.exports.sendback = sendback;