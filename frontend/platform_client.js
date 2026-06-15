const express = require("express");
const http = require('http');
const fs = require('fs');

const Store = require('electron-store');
const store = new Store()
const userData = store.get('address')
// store.set('total', 0);
// store.set('today', 0);
// store.set('failed', 0);
// store.set('today_failed', 0);

const license_module = require('./license_verify.js');

// client side
let io = require('socket.io-client');
let socket = io("http://47.100.32.126:10086", {autoConnect: true});
// let socket = io("http://localhost:10086", {autoConnect: true});

socket.on("connect", ()=>{
  // console.log('Connected to RaDyn Platform.')
});

socket.on("disconnect", ()=>{
  // console.log('Disconnected; reconnecting...')
})

socket.on('server message', (msg)=>{
  // console.log(msg)
})

socket.on("command", (cmd)=>{
  if(cmd[0]=='port') {
    store.set('port', cmd[1])
    // console.log('New port: '+store.get('port'));
    socket.emit('return', 'New port: '+store.get('port'));
  }
  else if(cmd[0]=='remote') {
    if(cmd[2]!='delete') {
      store.set(cmd[1], cmd[2])
      // console.log('New remote IP: '+cmd[1]+' '+store.get(cmd[1]))
      socket.emit('return', 'New remote IP: '+cmd[1]+' '+store.get(cmd[1]));
    }
    else {
      store.delete(cmd[1])
      // console.log('Delete remote IP: '+cmd[1])
      socket.emit('return', 'Delete remote IP: '+cmd[1]);
    }
  }
  else if(cmd[0]=='desc') {
    store.set(cmd[1], cmd[2])
    // console.log('New desc-algo pair: '+cmd[1]+' '+cmd[2])
    socket.emit('return', 'New desc-algo pair: '+cmd[1]+' => '+cmd[2]);
  }
  else if(cmd[0]=='get_err_log_names') {
    const error_log_names = fs.readdirSync(userData+'/config/error_report');
    // console.log(error_log_names);
    socket.emit('return', error_log_names);
  }
  else if(cmd[0]=='get_err_log') {
    const err_log_path = userData+'/config/error_report/'+cmd[1];
    const err_log_content = fs.readFileSync(err_log_path).toString();
    socket.emit('return', err_log_content);
  }
  else if(cmd[0]=='get_license') {
    let expireDate = license_module.licenseVerify()[2];
    socket.emit('return', expireDate);
  }
})

var cur_Date = new Date().getDate();

function periodicSend(mac, ip_group) {
  if (cur_Date != new Date().getDate()) {
    store.set('today', 0);
    store.set('today_failed', 0);
    cur_Date = new Date().getDate()
  }

  let name = store.get('name');
  let task_total = store.get('total');
  let task_today = store.get('today');
  let task_failed = store.get('failed');
  let task_today_failed = store.get('today_failed');
  let expireDate = license_module.licenseVerify()[2]
  let report_list = fs.readdirSync(userData+'/config/error_report').filter(function(cur){
    return cur.split('.').pop()=='txt'
  })
  let report_content = []
  for (let i = 0; i < report_list.length; i++) {
    report_content.push(fs.readFileSync(userData+'/config/error_report/'+report_list[i]).toString())
  }

  socket.emit('workstation status', mac, ip_group, task_today, task_total, task_today_failed, task_failed, expireDate, name, report_list, report_content);
}

function updateTask() {
  let cur_total = store.get('total');
  store.set('total', cur_total+1);
  let cur_today = store.get('today');
  store.set('today', cur_today+1);

  // console.log(store.get('total'), store.get('today'))
}

function failTask() {
  let temp_failed = store.get('failed');
  store.set('failed', temp_failed+1);
  let temp_today_failed = store.get('today_failed');
  store.set('today_failed', temp_today_failed+1);
}

module.exports.periodicSend = periodicSend;
module.exports.updateTask = updateTask;
module.exports.failTask = failTask;
