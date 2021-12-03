# Azure IoT HUb Addons for webthings.io gateway

to install and use:
1. clone it $ git clone https://github.com/JaycHub/fot-azureiothub.git
2. cd to fot-azureiothub $ cd fot-azureiothub
3. run $ npm install
4. package.sh is teh script that will compile and create a package to be used by webthingsio gateway, it will also copiying directly to .webthing/addons forlder for faster testing assuming you are developing the addon on the same machine that is running the gateway.
5. so give the package.sh permission to execute : $ chmod +x package.sh
6. next run: $ npm run build
7. everytime to change the source code run the build command in step 6 .
8. Enjoy!
