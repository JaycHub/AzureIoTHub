#!/bin/bash -e

#*********Created by Jay Cherrabi at Base4.ma ***********

#if you get npm ERR! Git working directory not clean.
# commit and push your changes to your git and run 
# npm version patch

#get the name of the .tgz file to generate
TARFILE=`npm pack`
#echo ${TARFILE}
#read the current version from package.json using node
CurrentVersion=$(node -p -e "require('./package.json').version")
#grab the name of our package from the package.json
PACKAGE_NAME=$(node -p -e "require('./package.json').name")
#echo ${PACKAGE_NAME}
#change to match your installation of teh gateway! This is the
red=`tput setaf 1`
green=`tput setaf 2`
yellow=`tput setaf 3`
reset=`tput sgr0`
echo "${red}******** please update the path to your runtime webthings ${yellow}GATEWAY_PATH ${red}usually it's at ${green}~/.webthings ${red}********${reset}"
#PATH to where the gateway is installed locally.
GATEWAY_PATH=$HOME/.webthings
#SET TO PROD before shipping, test allows us to bypass checksum check on the gateway which is helpfull for debugging and modifying JS file on the fly
NODE_ENV='dev'
#Get the Previously built version number
#we read the current version number from package.json and we detect it by 1
#PREVIOUS_PACKAGE_VERSION=$(echo $(node -p -e "require('./package.json').version")  | awk -F. -v OFS=. 'NF==1{print ++$NF}; NF>1{if(length($NF+1)>length($NF))$(NF-1)++; $NF=sprintf("%0*d", length($NF), ($NF+1)%(10^length($NF))); print}')
#$(echo $(node -p -e "require('./package.json').version") | awk -F. -v OFS=. 'NF==1{print ++$NF}; NF>1{$NF=sprintf("%0*d", length($NF), ($NF+1)); print }')
#PACKAGE_VERSION=$(echo 1.9.9 | awk -F. -v OFS=. 'NF==1{print ++$NF}; NF>1{if(length($NF+1)>length($NF))$(NF-1)++; $NF=sprintf("%0*d", length($NF), ($NF+1)%(10^length($NF))); print}')


#********** increment the version number ***************
# Get the current Version from package.json file and pass it to version_inc.awk script 
# which will update it and return the new version
#the output is something like this
#1:  1.2.3.4      =>  1.2.3.5
#2:  1.2.3.44     =>  1.2.3.45
#3:  1.2.3.99     =>  1.2.4.00
#4:  1.2.3        =>  1.2.4
#5:  9            =>  10
#6:  9.9.9.9      =>  10.0.0.0
#7:  99.99.99.99  =>  100.00.00.00
#8:  99.0.99.99   =>  99.1.00.00
#9:  =>           -1
#*******************************************************
#give it the proper permissions to be executed
chmod +x version_inc.awk

#send it to the script ./version_inc.awk to be incremented and read the return back
read NextVersion <<< $(echo | awk -v CurrentVArg=${CurrentVersion} -f version_inc.awk )
#echo ${NextVersion}
#show the new incremented version
#echo "Next Version is = "${NextVersion}
#PACKAGE_VERSION=$(echo $PACKAGE_VERSION | cut -c 2-)
#echo ${PACKAGE_VERSION}
#NPM Generates the incremental version number and updtes our package.json  so let's use it here
#Note this will fail if the repository is hosted on github
PACKAGE_VERSION=$(npm version ${NextVersion}) || PACKAGE_VERSION=$NextVersion
#echo ${PACKAGE_VERSION}

#exit

#rm -rf ${PREVIOUS_PACKAGE_FILE}
#rm -rf ${PREVIOUS_PACKAGE_FILE}.sha256sum
#exit
#remove the old adapter folder
rm -rf package
#mkdir package
#expand the compressed package to the adapter folder
#tar xzf ${TARFILE} -C package
tar xzf ${TARFILE}
#needed to install required package nlf for licenses
npm install
#generate licenses for the dependencies used
npm run licenses
cd package

#get the list of files sectionfrom the package.json
Files=$(node -p -e "require('./package.json').files")
#remove all the following charcters ][', 
Files=$(echo $Files | sed "s|[][',]||g")
#remove SHA256SUMS word from the rest of files
myFiles=$(echo $Files | sed 's/\<SHA256SUMS\>//g')
#echo $myFiles
#generate the checksum file for all included files
shasum --algorithm 256 package.json $myFiles > SHA256SUMS || echo "can't checksumn folders moving on"
#shasum --algorithm 256 package.json manifest.json ${PACKAGE_NAME}-adapter.js ${PACKAGE_NAME}-api-handler.js LICENSE README.md > SHA256SUMS
cd ..

if [ $NODE_ENV == 'dev' ]
then
  echo "Packaging DEV version"

  #npm install
else
  echo "Packaging Prod version"
  rm -rf node_modules
  npm install --production
  rm -rf node_modules/.bin
fi

pushd package
find . -type f -exec shasum --algorithm 256 {} \; >> SHA256SUMS
popd

#find node_modules \( -type f -o -type l \) -exec shasum --algorithm 256 {} \; >> package/SHA256SUMS
#find . \( -type f -o -type l \) -exec shasum --algorithm 256 {} \; >> SHA256SUMS

#check if this package has npm modules Production Dependencies if yes add node_module folder to the package
if ! grep -q '(empty)' <<< $(npm list --prod --depth=0 ) 
then
    echo "copy node_modules to the package folder"
    #cp -R node_modules package/${PACKAGE_NAME}/node_modules
    #cp -r node_modules package/  
    #mkdir -p package/${PACKAGE_NAME}/node_modules/
    #echo package/${PACKAGE_NAME}/node_modules/
    #echo package/${PACKAGE_NAME}/
    cp -r node_modules package
fi
#exit

tar czf ${TARFILE} package

shasum --algorithm 256 ${TARFILE} > ${TARFILE}.sha256sum

#rename the package folder to the adadper name
mv package ${PACKAGE_NAME}
mkdir package
mv ${PACKAGE_NAME} package/${PACKAGE_NAME}
#move the compressed file to the package fodler
mv ${TARFILE} package
mv ${TARFILE}.sha256sum package

#exit

if [[ -d ${GATEWAY_PATH} ]]
then
  echo "Copying Adapter folder to $GATEWAY_PATH/addons/${PACKAGE_NAME}"
    #if running in test env create a .git file so the gateway can bypass the checksum when loading the afapter 
    if [ $NODE_ENV == 'dev' ]
    then
      echo >> package/${PACKAGE_NAME}/.git
    fi
  rm -rf $GATEWAY_PATH/addons/${PACKAGE_NAME}
  cp -r package/${PACKAGE_NAME} $GATEWAY_PATH/addons/${PACKAGE_NAME}  
else
  echo "******ERROR: Gateway $GATEWAY_PATH path doesn't exists, please supply the correct path in GATEWAY_PATH *****"
fi

# if [[ ! -z "${ADAPTER_PATH}" ]]
# then
#     echo "Copying Adapter folder to destinationm gateway addons folder"
#     rm -rf ${ADAPTER_PATH} 
#     cp -r package/${PACKAGE_NAME} ${ADAPTER_PATH}
# else
#     echo "Gateway path doesn't exists, please supply the correct path in GATEWAY_PATH" 
# fi

rm -rf SHA256SUMS
#rm -rf SHA256SUMS package

# version=$(grep '"version":' manifest.json | cut -d: -f2 | cut -d\" -f2)

# rm -rf node_modules

# # If you have npm production dependencies, uncomment the following line
# # npm install --production

# mkdir package
# cp -r css images js views *.js manifest.json LICENSE README.md package/

# # If you have npm production dependencies, uncomment the following line
# # cp -r node_modules package/

# cd package
# find . \( -type f -o -type l \) -exec shasum --algorithm 256 {} \; >> SHA256SUMS
# cd ..

# TARFILE="example-extension-${version}.tgz"
# tar czf ${TARFILE} package
# shasum --algorithm 256 ${TARFILE} > ${TARFILE}.sha256sum

# rm -rf package
