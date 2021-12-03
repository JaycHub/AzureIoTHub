# Azure IoT hub Addons for webthings.io gateway 
please install the webthings gateway from here: https://github.com/WebThingsIO/gateway

inspired by https://github.com/tim-hellhake/azure-iot-bridge 

# Create an IoT Hub
1. Go to https://portal.azure.com/#create/hub
2. Search for IoT Hub
3. Click on Create
4. Create your hub
5. Wait for the deployment to be finished
6. Under Deployment detail: click on our hub resource
7. Go to Shared access policies
8. Click on the iothubowner
9. Copy the Connection string — primary key
10. Add the connection string from step 9 to the config
11. Go to http://[your-gateway]/oauth/authorize?response_type=code&client_id=local-token&scope=/things:readwrite
12. Create a token
13. Add the token to the config

# install and use this Addon:
1. clone it `$ git clone https://github.com/JaycHub/fot-azureiothub.git`
2. go to fot-azureiothub `$ cd fot-azureiothub`
3. run `$ npm install`
4. package.sh is teh script that will compile and create a package to be used by webthingsio gateway, it will also copiying directly to .webthing/addons forlder for faster testing assuming you are developing the addon on the same machine that is running the gateway.
5. so give the package.sh permission to execute : `$ chmod +x package.sh`
6. give permission to gather-licenses.js that will auto gather and compile all licenses from the node_module package into your LICENSE file: `chmod +x gather-licenses.js`
7. next run: `$ npm run build`
8. everytime to change the source code run the build command in step 6 .
9. Enjoy!

# To do:
1. auto delete the device from Azure IoT hub when it is removed from the gateway's things list
2. add option to create a digital twin
