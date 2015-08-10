var imports = {
  argv : require('optimist').argv,
  colors : require('colors'),
  dir : require('node-dir'),
  Deferred : require('promised-io/promise').Deferred,
  fs : require('promised-io/fs'),
  groupPromises : require('promised-io/promise').all,
  path : require('path'),
  readlineSync : require('readline-sync'),
  inflection : require('inflection')
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

  console.log(' ');
  console.log(' ');
}

function run() {
  var podify = new Podify(_dirname);
  podify.run();
}

var Podify = (function() {

  var log = console.log;

  function isSourceFile(fileName) {
    return fileName.indexOf('.js') > -1 || fileName.indexOf('.hbs') > -1;
  }

  function promise(value) {
    var deferred = new imports.Deferred();
    deferred.resolve(value);
    return deferred.promise;
  }

  function getBaseDirname(filePath) {
    return filePath.split(imports.path.sep).pop();
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

  function renameFile(filePath, newFileName) {
    return imports.fs.rename(filePath, newFileName).then(function() {
      log('Converted: ', filePath);
    }, function(error) {
      if(error.code === 'ENOENT') {
        log('Skipping ' + filePath + ' as it does not belong to a resource');
        return;
      }
    });
  }

  function childLevelFileConverter(filePath) {
    var fs = imports.fs;
    var path = imports.path;

    var fileExtension = path.extname(filePath);
    var dirname = path.dirname(filePath);
    var basedirname = getBaseDirname(dirname);
    var parentDirectory = path.dirname(path.resolve(filePath, '../'));
    var fileType = imports.inflection.singularize(getBaseDirname(parentDirectory));
    var baseFileName = path.basename(filePath, fileExtension);
    var destinationDir = path.resolve(dirname, '../../' + _podPrefix) + '/' + basedirname + '/' + baseFileName;
    var newFileName = destinationDir + '/' + fileType + fileExtension;

    logAction('Converting Child ' + fileType, baseFileName, filePath, newFileName);

    if(confirmAction()){
      return fs.mkdir(destinationDir).
        then(function() {
          log('Converted: ', filePath);
          return fs.rename(filePath, newFileName);
        }, function(error) {
          if(error.code !== 'EEXIST'){
            log(error);
          }

          log('Converted: ', filePath);
          return fs.rename(filePath, newFileName);
        });
    } else {
      log('Skipped: '.bold, filePath.bold);
      return promise();
    }
  }

  function rootLevelFileConverter(filePath) {
    var fs = imports.fs;
    var path = imports.path;

    var fileExtension = path.extname(filePath);
    var dirname = path.dirname(filePath);
    var basedirname = getBaseDirname(dirname);
    var singularizedDirname = imports.inflection.singularize(basedirname);
    var baseFileName = path.basename(filePath, fileExtension);
    var destinationDir;

    if(singularizedDirname === 'component'){
      destinationDir = path.resolve(dirname, '../' + _podPrefix) + '/components/' + baseFileName;
    } else {
      destinationDir = path.resolve(dirname, '../' + _podPrefix) + '/' + baseFileName;
    }

    var newFileName = destinationDir + '/' + singularizedDirname + fileExtension;

    logAction('Converting ' + singularizedDirname, baseFileName, filePath, newFileName);

    if(confirmAction()){
      var returnPromise = promise();
      if(['route', 'controller', 'component'].indexOf(singularizedDirname) > -1){
        returnPromise = fs.mkdir(destinationDir);
      }
      return returnPromise.
        then(function() {
          return renameFile(filePath, newFileName);
        }, function(error) {
          if(error.code !== 'EEXIST'){
            log(error);
          }
          return renameFile(filePath, newFileName);
        });
    } else {
      log('Skipped: '.bold, filePath.bold);
      return promise();
    }
  }

  function convertFiles(directory, converter) {

    return imports.fs.readdir(directory).
      then(function(files) {
        var promises = [];
        files.filter(isSourceFile).
        map(function(file) {
          return imports.path.join(directory, file);
        }).
        forEach(function(file) {
          promises.push(converter(file));
        });
        return imports.groupPromises(promises);
      }, function(error) {
        throw error;
      });
  }

  function componentTemplateConverter(filePath) {
    var fs = imports.fs;
    var path = imports.path;

    var baseFileName = path.basename(filePath, '.hbs');
    var newFileName = path.resolve() + '/app/components/' + baseFileName + '/template.hbs';
    var sourceFile = path.resolve() + '/app/templates/components/' + filePath;

    logAction('Converting Component Template', baseFileName, sourceFile, newFileName);

    if(confirmAction()){
      return fs.rename(sourceFile, newFileName);
    } else{
      log('Skipped: '.bold, sourceFile.bold);
      return promise();
    }
  }

  function convertComponentTemplatesFiles(directory) {
    return imports.fs.readdir(directory).
      then(function(files) {
        var promises = [];
        files.filter(isSourceFile).
        forEach(function(file) {
          promises.push(componentTemplateConverter(file));
        });
        return imports.groupPromises(promises);
      }, function(error) {
        log('No template directory found for components. Moving on...'.blue);
        return promise();
      });
  }

  function convertSubDirectory(parentDirectory) {
    var deferred = new imports.Deferred();

    imports.dir.subdirs(parentDirectory, function(error, directories) {
      if(error){ throw error; }

      var promises = [];

      directories.forEach(function(directory) {
        promises.push(convertFiles(directory, childLevelFileConverter));
      });

      imports.groupPromises(promises).then(function() {
        deferred.resolve();
      }, function(error){
        throw error;
      });
    });

    return deferred.promise;
  }

  function Podify(dirname, podPrefix) {
    this.directory = dirname;
    this.podPrefix = podPrefix;
  }

  Podify.prototype.run = function() {
    return this.makePodDirectory().
      then(this.convertComponentsToPods.bind(this)).
      then(this.convertRoutesToPods.bind(this)).
      then(this.convertSubRoutesToPods.bind(this));
  };

  Podify.prototype.makePodDirectory = function() {
    return imports.fs.mkdir('app/' + _podPrefix).then(function() {
      log('Created Pod Directory'.blue);
    }, function(error) {
      if(error.code !== 'EEXIST'){
        log(error);
      }
      log('Cool, looks like we have a pod directory already, no need to create one. Moving on...'.blue);
    });
  };

  Podify.prototype.convertComponentsToPods = function() {
    if(_skipComponents){
      return promise();
    }

    var componentDirectory =  this.directory + '/app/components';
    var componentTemplateDirectory =  this.directory + '/app/templates/components';
    return convertFiles(componentDirectory, rootLevelFileConverter).
      then(function() {
        return convertComponentTemplatesFiles(componentTemplateDirectory, true);
      });
  };

  Podify.prototype.convertRoutesToPods = function() {
    var appDirectory = this.directory + '/app';
    var routeDirectory =  appDirectory + '/routes';
    var controllerDirectory =  appDirectory + '/controllers';
    var templateDirectory =  appDirectory + '/templates';

    return convertFiles(routeDirectory, rootLevelFileConverter).
      then(function() {
        return convertFiles(controllerDirectory, rootLevelFileConverter).
          then(function() {
            return convertFiles(templateDirectory, rootLevelFileConverter);
          });
      });
  };

  Podify.prototype.convertSubRoutesToPods = function() {
    var appDirectory = this.directory + '/app';
    var routeDirectory =  appDirectory + '/routes';
    var controllerDirectory =  appDirectory + '/controllers';
    var templateDirectory =  appDirectory + '/templates';

    return convertSubDirectory(routeDirectory).then(function() {
      return convertSubDirectory(controllerDirectory).then(function() {
        return convertSubDirectory(templateDirectory);
      });
    });
  };

  return Podify;

})();


setup();
run();
