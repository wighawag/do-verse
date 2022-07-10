const fs = require('fs');
const path = require('path');
const { cwd } = require('process');

// let logs = '';
// const console = {
//   log(message) {
//     logs += `\n` + message;
//     fs.writeFileSync('log.txt', logs);
//   },
//   error(message) {
//     logs += `\nERRROR: ` + message;
//     fs.writeFileSync('log.txt', logs);
//   },
// };

const root = path.parse(process.cwd()).root;

function getPackageJSONPath(startPath) {
  startPath = startPath || process.cwd();

  let searchPath = startPath;
  let fileFound = false;
  let filepathFromInstallingProject;
  while (!fileFound) {
    filepathFromInstallingProject = path.join(searchPath, 'package.json');
    fileFound = fs.existsSync(filepathFromInstallingProject);
    if (!fileFound) {
      const newPath = path.join(searchPath, '..');
      if (
        newPath === searchPath ||
        newPath === root ||
        newPath === '.' ||
        newPath === '..'
      ) {
        break;
      }
      searchPath = newPath;
    }
  }

  if (fileFound) {
    return path.normalize(filepathFromInstallingProject);
  }
}

// from https://stackoverflow.com/a/26038979
function copyFileSync(source, target) {
  var targetFile = target;
  if (fs.existsSync(target)) {
    if (fs.lstatSync(target).isDirectory()) {
      targetFile = path.join(target, path.basename(source));
    }
  }
  fs.writeFileSync(targetFile, fs.readFileSync(source));
}

function copyFolderRecursiveSync(source, target) {
  var files = [];
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true });
  }
  if (fs.lstatSync(source).isDirectory()) {
    files = fs.readdirSync(source);
    files.forEach(function (file) {
      var curSource = path.join(source, file);
      if (fs.lstatSync(curSource).isDirectory()) {
        copyFolderRecursiveSync(curSource, path.join(target, file));
      } else {
        copyFileSync(curSource, target);
      }
    });
  }
}

function copy(destination) {
  if (fs.existsSync(destination)) {
    fs.rmSync(destination, { recursive: true });
  }
  fs.mkdirSync(destination, { recursive: true });

  // TODO automate from package.json "files"
  fs.copyFileSync(
    path.join(__dirname, '../tsconfig.json'),
    path.join(destination, 'tsconfig.json'),
  );
  fs.copyFileSync(
    path.join(__dirname, '../env.d.ts'),
    path.join(destination, 'env.d.ts'),
  );
  copyFolderRecursiveSync(
    path.join(__dirname, '../lib/'),
    path.join(destination, 'lib'),
  );
  copyFolderRecursiveSync(
    path.join(__dirname, '../src/'),
    path.join(destination, 'src'),
  );
}

let filepathFromInstallingProject;
if (process.env.INIT_CWD) {
  filepathFromInstallingProject = getPackageJSONPath(process.env.INIT_CWD);
} else {
  const currentFolder = cwd();
  if (
    path.normalize(path.join(__dirname, '../')) !==
    path.normalize(currentFolder)
  ) {
    filepathFromInstallingProject = getPackageJSONPath(currentFolder);
    console.log(`using current dir: ${filepathFromInstallingProject}`);
  }
}

if (!filepathFromInstallingProject) {
  console.error(
    `could not find package.json of parent package${
      process.env.INIT_CWD ? '' : ' (no INIT_CWD)'
    }`,
  );
} else {
  const content = fs.readFileSync(filepathFromInstallingProject, 'utf8');
  const json = JSON.parse(content);
  if (json.typescriptLibraries) {
    if (typeof json.typescriptLibraries !== 'string') {
      console.error(
        `typescriptLibraries is expectedted to be a string field in package.json`,
      );
      process.exit(1);
    }
    const myPackagefilepath = path.normalize(
      path.join(__dirname, '../package.json'),
    );
    if (myPackagefilepath === filepathFromInstallingProject) {
      console.log('skip as same package');
      process.exit(0);
    }
    if (!fs.existsSync(myPackagefilepath)) {
      console.error(`current package package.json not found`);
      process.exit(1);
    }

    const myPackageContent = fs.readFileSync(myPackagefilepath, 'utf8');
    const myPackage = JSON.parse(myPackageContent);

    const destination = path.join(
      path.dirname(filepathFromInstallingProject),
      json.typescriptLibraries,
      myPackage.name,
    );
    // const source = process.env['npm_config_dir'];
    // console.log({source, destination});
    copy(destination);
  } else {
    console.error(`typescriptLibraries not set`);
  }
}
