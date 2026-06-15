const licenseModule = require('./license_verify.js');
const errorLogs = require('./error_log.js');
const sendBack = require('./sendback.js');
const diskCapacity = require('./disk_capacity.js')
const delEarliest = require('./del_earliest.js')
const dicomCategory = require('./dicom_category.js')
const platformClient = require('./platform_client.js')

const fs = require('fs');
const path = require('path')
const sep = path.sep;
const childprocess = require("child_process");
const dicomParser = require('dicom-parser');

const Store = require('electron-store');
const store = new Store();
const userData = store.get('address')

import { doSQL, toSqlDateTime } from './mysqlConnection.js';

let splitdata;
const mac = licenseModule.licenseVerify()[1];

// send data to platform every X seconds
// setInterval(() => {
//   platformClient.periodicSend(mac, store.get('remote'));
// }, 5000);

// global running algos queue
let running = 0
let prev_time = 0

try {
  fs.mkdirSync(userData + sep + 'config' + sep + 'receive' + sep, { recursive: true });
}
catch (error) {
}

let portlist = store.get('portlist');
// console.log(portlist)
for (let i = 0; i < portlist.length; i++) {
  childprocess.exec("kill $(lsof -i:" + portlist[i] + " | grep LISTEN | awk '{print $2}')");
}

// Load unfinished Q after restart
// let f_applications = fs.readdirSync(userData + sep + 'config' + sep + 'input' + sep)
// for (let i = 0; i < f_applications.length; i++) {
//   let f_inputs = fs.readdirSync(userData + sep + 'config' + sep + 'input' + sep + f_applications[i])
//   // console.log(f_inputs)
//   for (let j = 0; j < f_inputs.length; j++) {
//     try {
//       fs.statSync(userData + sep + 'config' + sep + 'output' + sep + f_applications[i] + sep + f_inputs[j])
//     }
//     catch {
//       // console.log(f_inputs[j])
//       let f_algo_cmd = store.get(f_inputs[j])
//       // console.log(f_algo_cmd)
//       if (f_algo_cmd !== undefined) {
//         addToAlgoQ_2inputs(f_algo_cmd[0], f_algo_cmd[1], f_algo_cmd[2], f_algo_cmd[3], f_algo_cmd[4], f_algo_cmd[5], f_algo_cmd[6])

//       }
//     }
//   }
// }

// multiple incoming ports
setTimeout(() => {
  for (let i = 0; i < portlist.length; i++) {
    let recr = childprocess.exec('storescp -od "./receive/" -xcs "sh -c \'echo SCUINFOMSG #c #r #p #a\'" -sp -tos 1 -tn ' + portlist[i], { cwd: userData + sep + 'config' });
    recr.stdout.on(
      'data',
      function (data) {
        // delOld()
        processIncoming(data)
      }
    );

    recr.on(
      'close',
      function (data) {
        // console.log('there will be no more messages');
      }
    );

    // console.log(recr.pid)
  }
}, 2000);

// process incoming DICOM inputs
function processIncoming(data) {
  // console.log('Processing Incoming...')
  splitdata = data.toString();
  let scuselfAE = splitdata.trim().split(/\s+/)[4].replace(/^\"|\"$/g, '');
  let revName = splitdata.trim().split(/\s+/)[3].trim().split(sep).pop();
  // console.log(revName, scuselfAE);

  // finding receiving terminals
  // console.log('Finding receiving terminals...');
  let all_AE = store.get('remote');

  // console.log(all_AE, all_AE[scuselfAE]);
  if (all_AE[scuselfAE] === undefined) {
    console.error('No matching AE title! sender AE: ' + scuselfAE)
    errorLogs.errorMessage('storescu', 'No matching AE title! sender AE: ' + scuselfAE);
    return;
  }

  let designated_ip_info = all_AE[scuselfAE].split('|');
  let designated_ipnum = designated_ip_info.length;
  // console.log('Found ' + designated_ipnum + ' receiving terminals for ' + scuselfAE)
  // console.log(designated_ip_info, designated_ipnum)

  if (licenseModule.licenseVerify()[0]) {
    // console.log("AE与项目匹配");
    let scrfolderpath = userData + sep + 'config' + sep + 'receive' + sep + revName;
    // console.log(scrfolderpath)
    let file0name = fs.readdirSync(scrfolderpath);
    // console.log(file0name);
    // console.log(file0name.length);

    // can be improved
    let num = file0name.length;
    let arr = []

    for (let i = 0; i < num; i++) {
      let content = fs.readFileSync(scrfolderpath + sep + file0name[i]);
      arr.push(content);
    }

    let cat_arr = dicomCategory.dicom_category(arr)
    for (let i = 0; i < cat_arr.length; i++) {
      // let temp_path = userData + sep + 'config' + sep + 'receive' + sep + i + new Date().getTime()
      // classify Dicom series into different directories
      let dcm_path = scrfolderpath + sep + file0name[cat_arr[i][0]];
      let temp_content = fs.readFileSync(dcm_path);
      let temp_contentParsed = dicomParser.parseDicom(temp_content);

      //修改var->let  series_desc\modality\pname\algo_path_with_t\input_path
      let series_desc = temp_contentParsed.string('x0008103e').replace(/\s*/g, ""); //序列描述
      let modality = temp_contentParsed.string('x00080060');    //
      let pname = temp_contentParsed.string('x00100010') //姓名
      let pID = temp_contentParsed.string('x00100020'); //病人id
      let scanTime = temp_contentParsed.string("x00080020"); //扫描时间
      let sex = temp_contentParsed.string("x00100040"); //性别
      let birthtime = temp_contentParsed.string("x00100030") //生日
      let para = store.get(series_desc);
      if (pname !== undefined) {
        pname = pname.replace(/\s*/g, "")
      }
      if (birthtime === undefined) {
        birthtime = '1000-01-01'
      }

      let algo_path = 'nnunet'
      // console.log(algo_path, pp_para);
      let application = 'NNUNET'

      let cur_time = new Date().getTime()
      // console.log(prev_time, cur_time)
      if (cur_time <= prev_time) {
        // console.log('collision')
        cur_time = prev_time + 1
      }
      prev_time = cur_time
      let algo_path_with_t = application + '_' + cur_time
      // console.log(algo_path_with_t, prev_time, cur_time)

      // console.log('put into ' + application + ' directory')
      let input_path = userData + sep + 'config' + sep + 'input' + sep + application + sep + algo_path_with_t;
      // try {
      //   fs.mkdirSync(userData + sep + 'config' + sep + 'input' + sep + application + sep, { recursive: true });
      //   fs.mkdirSync(userData + sep + 'config' + sep + 'output' + sep + application + sep, { recursive: true });
      // }
      // catch (error) {
      //   // console.log(error);
      // }

      // --- Database ---
      //连接数据库 
      let tableName;
      if (application === undefined) { tableName = 'noMatchAlgo' }
      else {
        tableName = application;//数据库中表的名字 与application对应
      }
      let SQL = "insert into " + tableName + " (seriesDesc,scanMode,scanTime,name,seriesID,inputPath,pID,sex,birthday,flag) values('" + series_desc + "','" + modality + "','" + scanTime + "','" + pname + "','" + algo_path_with_t + "','" + input_path + "','" + pID + "','" + sex + "','" + birthtime + "',0)"
      console.log(SQL);
      //执行SQL
      doSQL(SQL);
      // //关闭数据库.close MySql
      // closeMysqlConnection();
      // --- Database ---
      fs.mkdir(input_path, { recursive: true }, function (error) {
        if (error) {
          console.error(error)
        }
        else {
          // console.log(input_path)
          for (let j = 0; j < cat_arr[i].length; j++) {
            let temp_name = fs.readFileSync(scrfolderpath + sep + file0name[cat_arr[i][j]])
            fs.writeFileSync(input_path + sep + file0name[cat_arr[i][j]], temp_name)
          }

          if (modality === 'PT') {
            if (store.get('CT.' + pname) === undefined) {
              store.set('PT.' + pname, algo_path_with_t);
            }
            else {
              let ct_address = store.get('CT.' + pname);
              store.delete('CT.' + pname)
              // change directory name
              let SQL_updateSID1 = "update " + tableName + " set seriesId = '" + algo_path_with_t + "_CT', inputPath = '" + userData + sep + 'config' + sep + 'input' + sep + application + sep + algo_path_with_t + "_CT', flag = 3 where seriesId = '" + ct_address + "'"
              doSQL(SQL_updateSID1);

              let SQL_updateSID2 = "update " + tableName + " set seriesId = '" + algo_path_with_t + "_PT', inputPath = '" + userData + sep + 'config' + sep + 'input' + sep + application + sep + algo_path_with_t + "_PT' where seriesId = '" + algo_path_with_t + "'"
              doSQL(SQL_updateSID2);

              fs.rename(userData + sep + 'config' + sep + 'input' + sep + application + sep + ct_address,
                userData + sep + 'config' + sep + 'input' + sep + application + sep + algo_path_with_t + '_CT', () => {
                  // console.log('modified CT directory name for NNUNET')
                })
              fs.rename(userData + sep + 'config' + sep + 'input' + sep + application + sep + algo_path_with_t,
                userData + sep + 'config' + sep + 'input' + sep + application + sep + algo_path_with_t + '_PT', () => {
                  // console.log('modified PT directory name for NNUNET')
                })

              store.set(algo_path_with_t + '_PT', [algo_path, algo_path_with_t + '_PT', algo_path_with_t + '_CT', designated_ipnum, designated_ip_info, dcm_path, application])
              addToAlgoQ_2inputs(algo_path, algo_path_with_t + '_PT', algo_path_with_t + '_CT', designated_ipnum, designated_ip_info, dcm_path, application,para)

            }
          }
          else if (modality === 'CT') {
            if (store.get('PT.' + pname) === undefined) {
              store.set('CT.' + pname, algo_path_with_t);
            }
            else {
              let pt_address = store.get('PT.' + pname);
              store.delete('PT.' + algo_path + '.' + pname);
              // change directory name
              let SQL_updateSID1 = "update " + tableName + " set seriesId = '" + algo_path_with_t + "_PT', inputPath = '" + userData + sep + 'config' + sep + 'input' + sep + application + sep + algo_path_with_t + "_PT' where seriesId = '" + pt_address + "'"
              doSQL(SQL_updateSID1);
              let SQL_updateSID2 = "update " + tableName + " set seriesId = '" + algo_path_with_t + "_CT', inputPath = '" + userData + sep + 'config' + sep + 'input' + sep + application + sep + algo_path_with_t + "_CT', flag = 3 where seriesId = '" + algo_path_with_t + "'"
              doSQL(SQL_updateSID2);

              fs.rename(userData + sep + 'config' + sep + 'input' + sep + application + sep + pt_address,
                userData + sep + 'config' + sep + 'input' + sep + application + sep + algo_path_with_t + '_PT', () => {
                  // console.log('modified PT directory name for NNUNET')
                })
              fs.rename(userData + sep + 'config' + sep + 'input' + sep + application + sep + algo_path_with_t,
                userData + sep + 'config' + sep + 'input' + sep + application + sep + algo_path_with_t + '_CT', () => {
                  // console.log('modified CT directory name for NNUNET')
                })

              store.set(algo_path_with_t + '_PT', [algo_path, algo_path_with_t + '_PT', algo_path_with_t + '_CT', designated_ipnum, designated_ip_info, dcm_path, application])
              addToAlgoQ_2inputs(algo_path, algo_path_with_t + '_PT', algo_path_with_t + '_CT', designated_ipnum, designated_ip_info, dcm_path, application,para)

            }
          }



        }
      })
    }

  }
  else {
    console.error('License Expired!');
    // console.log(designated_ip_info, designated_ipnum);
    errorLogs.errorMessage('license_invalid', 'foo');
  }

}

function removePromise(dir) {
  return new Promise(function (resolve, reject) {
    //先读文件夹
    fs.stat(dir, function (err, stat) {
      if (stat.isDirectory()) {
        fs.readdir(dir, function (err, files) {
          files = files.map(file => path.join(dir, file)); // a/b  a/m
          files = files.map(file => removePromise(file)); //这时候变成了promise
          Promise.all(files).then(function () {
            fs.rmdir(dir, resolve);
          })
        })
      } else {
        fs.unlink(dir, resolve)
      }
    })
  })
}

let copy = function (src, dst, callback) {
  let paths = fs.readdirSync(src); //同步读取当前目录
  paths.forEach(function (path) {
    let _src = src + sep + path;
    let _dst = dst + sep + path;
    fs.stat(_src, function (err, stats) {  //stats  该对象 包含文件属性
      if (err) throw err;
      if (stats.isFile()) { //如果是个文件则拷贝 
        let readable = fs.createReadStream(_src);//创建读取流
        let writable = fs.createWriteStream(_dst);//创建写入流
        readable.pipe(writable);
      }
    });
  });
  return callback()
}

function mkdirSync(dir, cb) {
  let paths = dir.split(sep);
  let index = 1;
  function next(index) {
    //递归结束判断
    if (index > paths.length) return cb();
    let newPath = paths.slice(0, index).join(sep);
    fs.access(newPath, function (err) {
      if (err) {//如果文件不存在，就创建这个文件
        fs.mkdir(newPath, function (err) {
          next(index + 1);
        });
      } else {
        //如果这个文件已经存在，就进入下一个循环
        next(index + 1);
      }
    })
  }
  next(index);
}

function addToAlgoQ_2inputs(algo_path, pt_address, ct_address, designated_ipnum, designated_ip_info, dcm_path, application,para) {

  // console.log(pt_address + ' and ' + ct_address + ' try accessing GPU...')
  // Define how many concurrent docker containers to run here:
  if (running < 1) {
    // console.log('Initiating docker algorithms...');
    running++;
    // console.log(running + ' algos are running');
    runAlgo_2inputs(algo_path, pt_address, ct_address, designated_ipnum, designated_ip_info, dcm_path, application,para);
  }
  else {
    // console.log('Waiting ... ')
    setTimeout(() => {
      addToAlgoQ_2inputs(algo_path, pt_address, ct_address, designated_ipnum, designated_ip_info, dcm_path, application,para);
    }, 10000);
  }
}

function runAlgo_2inputs(algo_path, algo_path_with_pt, algo_path_with_ct, ipnum, remoteipinfo, dcm_path, application,para) {

  let timestamp = new Date().getTime();
  let container_name = algo_path + timestamp.toString();
  let algos_image = store.get(application + '_image');
  let algo_cmd;
  if(para){
    algo_cmd = 'docker run --gpus=all --name=' + container_name +
    ' -v ' + userData + '/config/input/' + application + sep + algo_path_with_pt + ':/NuCAD/PET_in ' +
    ' -v ' + userData + '/config/input/' + application + sep + algo_path_with_ct + ':/NuCAD/CT_in ' +
    algos_image +' '+ para;
  }
  else
    algo_cmd = 'docker run --gpus=all --name=' + container_name +
      ' -v ' + userData + '/config/input/' + application + sep + algo_path_with_pt + ':/NuCAD/PET_in ' +
      ' -v ' + userData + '/config/input/' + application + sep + algo_path_with_ct + ':/NuCAD/CT_in ' +
      algos_image;
  console.log(algo_cmd)

  childprocess.exec(algo_cmd, {}, function (error) {
    running--;
    // console.log('Current docker run completed; running containers: ' + running)
    if (error) {
      fs.mkdirSync(userData + '/config/output/' + application + sep + algo_path_with_pt, { recursive: true })
      console.error(`Docker Algorithms Error: ${error}`);
      // platformClient.failTask();
      errorLogs.errorMessage('docker_algos', error.toString(), dcm_path, algo_path_with_pt, application);
      // removePromise(userData+'/config/input/'+algo_path_with_t).then(()=>{// console.log('delete '+algo_path+' MR files.');});
      let output_path = userData + '/config/output/' + application + sep + algo_path_with_pt;
      let SQL_updateTime = "update NNUNET set outputPath = '" + output_path + "' ,flag = 2 where seriesId = '" + algo_path_with_pt + "'"
      doSQL(SQL_updateTime);
      store.delete(algo_path_with_pt)
    }
    else {
      fs.mkdirSync(userData + '/config/output/' + application + sep + algo_path_with_pt, { recursive: true })
      // console.log(data);
      // console.log('Algorithms completed.');
      let cp_cmd = 'docker cp ' + container_name + ':/NuCAD/out ' + userData + '/config/output/' + application + sep + algo_path_with_pt;

      childprocess.exec(cp_cmd, {}, function (error) {
        if (error) {
          console.error(`Writing Files Error: ${error}`);
          errorLogs.errorMessage('write_files', error.toString(), dcm_path, algo_path_with_pt, application);
          // removePromise(userData + '/config/input/' + application + sep + algo_path_with_pt).then(() => { });
          // removePromise(userData + '/config/input/' + application + sep + algo_path_with_ct).then(() => { });
        }
        else {
          //数据库操作
          let output_path = userData + '/config/output/' + application + sep + algo_path_with_pt;
          let modifiedtime = fs.statSync(output_path).birthtime;
          modifiedtime = toSqlDateTime(modifiedtime);
          let tableName;
          if (application === undefined) { tableName = 'noMatchAlgo' }
          else {
            tableName = application;//数据库中表的名字 与application对应
          }
          //执行SQL
          let SQL_updateTime = "update " + tableName + " set processingTime = '" + modifiedtime + "', outputPath = '" + output_path + "' ,flag = 1 where seriesId = '" + algo_path_with_pt + "'"
          // console.log(SQL_updateTime);
          doSQL(SQL_updateTime);
          //
        }
        store.delete(algo_path_with_pt)
      })
    }
  });
}