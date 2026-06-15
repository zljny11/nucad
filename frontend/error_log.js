const fs = require('fs');
const childprocess = require("child_process");
// const sendBack = require('./sendback.js');

const Store = require('electron-store');
const store = new Store();
const userData = store.get('address')

function errorMessage(input_args, error_info, file_path, algo_path_with_t, application) {
  var error_log_name = input_args;
  //generate error log and convert to pdf here; dir: /home/subtle/.config/radyn_mr/config/
  var current_time = new Date();
  // 202111011745
  var readable_time = current_time.getFullYear() * 100000000 + (current_time.getMonth() + 1) * 1000000 + current_time.getDate() * 10000 + current_time.getHours() * 100 + current_time.getMinutes();
  if (error_log_name == 'storescu') {
    var err_logs = error_info;
    // `
    // DICOM Transfer error! <br>
    // Please check remote IP or Internet Connection. <br>
    // Error Message: <br> ` + error_info;
  }
  else if (error_log_name == 'docker_algos') {
    var err_logs =
      `Docker Algorithms Error!<br/>Please try again or contact technical support of RaDyn.<br/>Error Message:` + error_info.replaceAll("\"", "&quot;").replaceAll("\n", "<br/>");
  }
  else if (error_log_name == 'write_files') {
    var err_logs =
      `Writing Files Error!<br/>Please check write permission / file location or contact technical support of RaDyn Products.<br/>Error Message:` + error_info;
  }
  else if (error_log_name == 'license_invalid') {
    var err_logs =
      `License Invalid!<br/>Please contact Radio Dynamic Healthcare to renew your license.`;
  }
  let jsonData = '{"ErrorType":"' + error_log_name + '","ReportTime":"' + readable_time + '","ReportTitle":"RadynNuCAD Error Report","ErrorInfo":"' + err_logs + '"}';
  let jsonObj = JSON.parse(jsonData);
  let jsonContent = JSON.stringify(jsonObj);

  fs.writeFileSync(userData + '/config/output/NNUNET/' + algo_path_with_t + '/err_log.json', jsonContent, 'utf8', function (err) {
    if (err) {
      console.log("An error occured while writing JSON Object to File.");
      console.log(err);
    }
  });
  fs.writeFileSync(userData + '/config/error_report/err_log' + readable_time + '.txt', err_logs);
}

module.exports.errorMessage = errorMessage;