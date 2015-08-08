var imports = {
  argv : require('optimist').argv,
  colors : require('colors'),
  dir : require('node-dir'),
  Deferred : require('promised-io/promise').Deferred,
  fs : require('promised-io/fs'),
  groupPromises : require('promised-io/promise').all,
  path : require('path'),
  readlineSync : require('readline-sync')
};

var _confirmActions = true;
var _dirname;
var _skipComponents;
var _podPrefix;

function setup() {

  var argv = imports.argv;

  if(argv.dir) {
    _dirname = argv.dir;
    if(_dirname === '.'){
      _dirname = process.cwd();
    }
  } else {
    _dirname = process.cwd();
  }

  console.log(' ');

  console.log('Project Directory: '.bold, _dirname.blue);

  if(argv.force) {
    console.log('skipping confirmation'.red);
    _confirmActions = false;
  }

  if(argv.skipComponents) {
    _skipComponents = true;
    console.log('skipping components'.blue);
  }

  if(argv.pod) {
    _podPrefix = argv.pod;
  } else {
    _podPrefix = 'pods';
  }
  console.log('Pod Prefix: '.bold, _podPrefix.blue);
}

function run() {
  var podify = new Podify(_dirname);
  podify.run();
}

var Podify = (function() {

  var log = console.log;

  function isJSFile(fileName) {
    return fileName.indexOf('.js') > -1;
  };

  function isHBSFile(fileName){
    return fileName.indexOf('.hbs') > -1;
  }

  function promise(value) {
    var deferred = new imports.Deferred();
    deferred.resolve(value);
    return deferred.promise;
  }

  function confirmAction() {

    if(!_confirmActions){
      return true;
    }

    var answer = imports.readlineSync.question('Continue [yes/no] (no answer = no) ?');
    if(answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y'){
      return true;
    } else {
      return false;
    }
  }

  function logAction(title, baseFileName, sourceFile, destination) {
    log(" ");
    log(" ");
    log(title.underline);
    log('File Name: '.bold, baseFileName.bold);
    log('Source: '.bold, sourceFile.blue);
    log('Destination: '.bold, destination.red);
    log(" ");
  }

  function componentJSFileConverter(filePath) {
    var fs = imports.fs;
    var path = imports.path;

    var baseFileName = path.basename(filePath, '.js');
    var folderName = path.dirname(filePath);
    var newFileName = folderName + '/'+baseFileName + '/component.js';

    logAction('Converting Component', baseFileName, filePath, newFileName);

    if(confirmAction()){
      return fs.mkdir(baseFileName).
        then(function() {
          return fs.rename(filePath, newFileName);
        });
    } else {
      log('Skipped: '.bold, filePath.bold);
      return promise();
    }
  }

  function routeJSFileConverter(filePath) {
    var fs = imports.fs;
    var path = imports.path;

    var baseFileName = path.basename(filePath, '.js');
    var sourceFile = path.resolve() + '/app/routes/' + filePath;
    var podDirectoryPath = path.resolve(filePath, '../app/'+_podPrefix+'/') + '/' + baseFileName;
    var newFileName = podDirectoryPath + '/route.js';

    logAction('Converting Route', baseFileName, sourceFile, newFileName);

    if(confirmAction()){
      return fs.mkdir(podDirectoryPath).
        then(function() {
          return fs.rename(filePath, newFileName);
        });
    } else {
      log('Skipped: '.bold, sourceFile.bold);
      return promise();
    }
  }

  function controllerJSFileConverter(filePath) {
    var fs = imports.fs;
    var path = imports.path;

    var baseFileName = path.basename(filePath, '.js');
    var sourceFile = path.resolve() + '/app/controllers/' + filePath;
    var podDirectoryPath = path.resolve(filePath, '../app/'+_podPrefix+'/') + '/' + baseFileName;
    var newFileName = podDirectoryPath + '/controller.js';

    logAction('Converting Controller', baseFileName, sourceFile, newFileName);

    if(confirmAction()){
      return fs.mkdir(podDirectoryPath).
        then(function() {
          return fs.rename(filePath, newFileName);
        });
    } else {
      log('Skipped: '.bold, sourceFile.bold);
      return promise();
    }
  }

  function convertJSFiles(directory, converter) {

    return imports.fs.readdir(directory).
      then(function(files) {
        var promises = [];
        var jsFiles = files.filter(isJSFile);
        jsFiles.forEach(function(file) {
          promises.push(converter(file));
        });
        return imports.groupPromises(promises);
      }, function(error) {
        throw error;
      });
  }

  function templateConverter(filePath, isComponent) {
    var fs = imports.fs;
    var path = imports.path;

    var baseFileName = path.basename(filePath, '.hbs');

    if(isComponent){
      var newFileName = path.resolve() + '/app/components/'+baseFileName+'/template.hbs';
      var sourceFile = path.resolve() + '/app/templates/components/' + filePath;
    } else{
      var newFileName = path.resolve() + '/app/'+_podPrefix+'/'+baseFileName+'/template.hbs';
      var sourceFile = path.resolve() + '/app/templates/' + filePath;
    }

    logAction('Converting Template', baseFileName, sourceFile, newFileName);

    if(confirmAction()){
      return fs.rename(templatePath, newFileName);
    } else{
      log('Skipped: '.bold, sourceFile.bold);
      return promise();
    }
  }

  function convertTemplatesFiles(directory, isComponent) {

    return imports.fs.readdir(directory).
      then(function(files) {
        var promises = [];
        var hbsFiles = files.filter(isHBSFile);
        hbsFiles.forEach(function(file) {
          promises.push(templateConverter(file, isComponent));
        });
        return imports.groupPromises(promises);
      }, function(error) {
        log('No template directory found for components. Moving on...'.blue);
        return promise();
      });
  }

  function Podify(dirname, podPrefix) {
    this.directory = dirname;
    this.podPrefix = podPrefix;
  }

  Podify.prototype.run = function() {
    return this.makePodDirectory().
      then(this.convertComponentsToPods.bind(this)).
      then(this.convertRoutesToPods.bind(this));
  };

  Podify.prototype.makePodDirectory = function() {
    return imports.fs.mkdir('app/'+_podPrefix);
  };

  Podify.prototype.convertComponentsToPods = function() {
    if(_skipComponents){
      return promise();
    }

    var componentDirectory =  this.directory + '/app/components';
    var componentTemplateDirectory =  this.directory + '/app/templates/components';
    return convertJSFiles(componentDirectory, componentJSFileConverter).
      then(function() {
        return convertTemplatesFiles(componentTemplateDirectory, true);
      });
  };

  Podify.prototype.convertRoutesToPods = function() {
    var appDirectory = this.directory + '/app';
    var routeDirectory =  appDirectory + '/routes';
    var controllerDirectory =  appDirectory + '/controllers';
    var templateDirectory =  appDirectory + '/templates';

    return convertJSFiles(routeDirectory, routeJSFileConverter).
      then(function() {
        convertJSFiles(controllerDirectory, controllerJSFileConverter).
          then(function() {
            return convertTemplatesFiles(templateDirectory);
          });
      });
  };

  return Podify;

})();


setup();
run();
