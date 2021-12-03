/**
 * fot-activation-adapter.js 
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

'use strict';

const { Adapter, Database, Device, } = require('gateway-addon');
const AzureIoTHub = require('azure-iothub');
const { Property, WebThingsClient } = require('webthings-client');
const AzureIoTDevice = require('azure-iot-device');
const Transport = require('azure-iot-device-amqp');
const Message = require('azure-iot-common').Message;
// var _ = require('underscore');

//IoTHub related errors
var UnauthorizedError = require('azure-iot-common').errors.UnauthorizedError;
/* useful error list
var ThrottlingError = require('azure-iot-common').errors.ThrottlingError;
var TimeoutError = require('azure-iot-common').errors.TimeoutError;
var NotConnectedError = require('azure-iot-common').errors.NotConnectedError;
var IotHubNotFoundError = require('azure-iot-common').errors.IotHubNotFoundError;
var IotHubQuotaExceededError = require('azure-iot-common').errors.IotHubQuotaExceededError;
var NotImplementedError = require('azure-iot-common').errors.NotImplementedError;
//IoTHub Registry related errors
var DeviceRegistrationFailedError = require('azure-iot-common').errors.DeviceRegistrationFailedError;
var DeviceAlreadyExistsError = require('azure-iot-common').errors.DeviceAlreadyExistsError;
var DeviceNotFoundError = require('azure-iot-common').errors.DeviceNotFoundError;
var TooManyDevicesError = require('azure-iot-common').errors.TooManyDevicesError;
//IoTHub Twin related errors
var TwinRequestError = require('azure-iot-common').errors.TwinRequestError;
*/

//maybe useful in later version
let webthingDevicesList = new Set();
//for our IoThub class instance
let AZIotHub = null;

class FotAzureIoTHubAdapter extends Adapter {
    constructor(addonManager, pkgManifest, errorCallback) {
        super(addonManager, pkgManifest.id, pkgManifest.id);
        addonManager.addAdapter(this);
        this.addonManager = addonManager;
        this.pkgManifest = pkgManifest;
        this.errorCallback = errorCallback;
        const db = new Database(this.pkgManifest.id);
        db.open().then(() => {
            return db.loadConfig();
        }).then((cfg) => {
            this.adapterConfig = cfg;
            const { hubConnectionString, accessToken } = this.adapterConfig;
            if (!hubConnectionString) {
                console.log("hubConnectionString not found");
                //Send Error message to the users web interface and unload the addon
                this.errorCallback('Please configure the IoTHub connection string.');
            } else {
                //console.log("Creating IoTHub class");
                AZIotHub = new IotHub(this, this.pkgManifest, this.adapterConfig, errorCallback);
            }
            if (!accessToken) {
                this.errorCallback('Please configure the Access Token, by creating a new token from under developer settings.');
            }
        }).then(() => {
            db.close();
        }).catch(console.error);
    }

    cancelPairing() {
        console.log('AdapterProxy: cancelPairing', this.getName(), 'id', this.getId());
    }
    startPairing(_timeoutSeconds) {
        console.log("startPairing() function called");
        console.log(_timeoutSeconds);
    }

    handleServiceUp(device) {
        console.log("handleServiceUp() function called")
    }

    handleServiceDown(device) {
        console.log("handleServiceDown() function called")
    }

    startDiscovery() {
        console.log("startDiscovery() function called")
    }
    /**
     * Unpair the provided the device from the adapter.
     *
     * @param {Object} device Device to unpair with
     */
    removeThing(device) {
        console.log(`removeThing(Device{id: ${device.getId}})`);
    }
    /**
    * https://github.com/WebThingsIO/gateway/blob/45e0015c76559d99b68e13482b9dceb9bee59f2d/src/plugin/adapter-proxy.ts
    * Cancel unpairing process.
    *
    * @param {Object} device Device that is currently being paired
    */
    cancelRemoveThing(device) {
        console.log(`cancelRemoveThing(Device{id: ${device.getId}})`);
    }
    addDevice(deviceId, deviceDescription) {
        console.log(`addDevice(Device{id: ${deviceId}}), Description:${deviceDescription}`);
    }
    removeDevice(deviceId) {
        console.log(`addDevice(Device{id: ${deviceId}})`);
    }
    clearState() {
        console.log('Clear State');
    }
    pairDevice(deviceId, deviceDescription) {
        console.log(`addDevice(Device{id: ${deviceId}}), Description:${deviceDescription}`);
    }
    unpairDevice(deviceId) {
        console.log(`addDevice(Device{id: ${deviceId}})`);
    }
    setPin(deviceId, pin) {
        console.log(`setPin(Device{ id: ${deviceId}}), and Pin{ pin: ${pin} } `);
    }
    unload() {
        //triggered when the addon is uinloaded
        console.log("unload() function called");
        return Promise.resolve();
    }
}

class IotHub extends Device {
    constructor(adapter, pkgManifest, adapterConfig, errorCallback) {
        super(adapter, pkgManifest.id, adapterConfig);
        this.adapterConfig = adapterConfig;
        this.pkgManifest = pkgManifest;
        this.errorCallback = errorCallback;
        this.twinByDeviceId = {};
        this.devicesList = {};
        this.connectedDevicesList = {};
        this.batchByDeviceId = {};
        this.lastDeviceCheck = new Date();
        this.client = {};
        this['@context'] = 'https://iot.mozilla.org/schemas/';
        this.setTitle(this.pkgManifest.display_name);
        const { hubConnectionString, accessToken } = this.adapterConfig;
        if (hubConnectionString) {
            const { HostName } = AzureIoTHub.ConnectionString.parse(hubConnectionString);
            if (!HostName) {
                //console.log(`Invalid hub connection string, could not extract hostname`);
                errorCallback('Invalid hub connection string, could not extract hostname.');
            }
            this.hubHostName = HostName;
            this.registry = AzureIoTHub.Registry.fromConnectionString(hubConnectionString);
            //check if the users connectionSctring is valid, by trying to get statistics of the IoTHub registry
            //this.getRegistryStatistics = this.registry.getRegistryStatistics(this.onConnected);
            this.getRegistryStatistics = this.registry.getRegistryStatistics(function (err, result) {
                if (err) {
                    //console.log(`Invalid hub connection string, could not connect to IoTHub`);
                    errorCallback(`Invalid hub connection string, "${err.message}", please check the connection string.`);
                }
                else {
                    //we are able to connect to IoTHub lets continue
                    AZIotHub.init(adapterConfig);
                }
            });
        }

        return this;
    }
    IoTHubcheckAndUpdate(IoTdevice, next) {
        return function printResult(err, deviceInfo, res) {
            if (err) {
                //console.log(' error: ' + err.toString());
            }
            if (res) {
                //console.log(' status: ' + res.statusCode + ' ' + res.statusMessage);
            }
            if (deviceInfo) {
                //console.log(op + ' device info: ' + JSON.stringify(deviceInfo));
                IoTdevice = deviceInfo;
            }
            if (next) next(IoTdevice);
        };
    }
    //create our devices in the Azure IoTHub
    async createIotHubDevice(webThingDevice) {
        return new Promise((resolve, reject) => {
            var IoTdevice = new AzureIoTHub.Device(null);
            IoTdevice.deviceId = webThingDevice.id();
            AZIotHub.registry.create(IoTdevice, AZIotHub.IoTHubcheckAndUpdate(IoTdevice, function next(myIoTdevice) {
                AZIotHub.registry.get(myIoTdevice.deviceId, AZIotHub.IoTHubcheckAndUpdate(myIoTdevice, async function next(AzIoTdevice) {
                    //console.log('\n**got device \'' + AzIoTdevice.deviceId + "=" + AzIoTdevice.authentication.symmetricKey.primaryKey + '\'');
                    //console.log(`${AzIoTdevice.deviceId} is ${AzIoTdevice.status}`);
                    AZIotHub.devicesList[AzIoTdevice.deviceId] = AzIoTdevice;
                    const deviceConnectionString = `HostName=${AZIotHub.hubHostName};DeviceId=${AzIoTdevice.deviceId};SharedAccessKey=${AzIoTdevice.authentication.symmetricKey.primaryKey}`;
                    var AzIoTClient = AzureIoTDevice.Client.fromConnectionString(deviceConnectionString, Transport.Amqp);
                    try {
                        await AzIoTClient.open();
                        //save the Azure IoTHub device connection 
                        AZIotHub.connectedDevicesList[AzIoTdevice.deviceId] = AzIoTClient;
                        resolve();
                    }
                    catch (err) {
                        reject(err);
                        console.warn(`AzIoTClient Could not connect to device ${AzIoTdevice.deviceId}`);
                    }
                }));
            }));
        });

    }

    //instatiate our devices and create and connect to IoThub
    async init(adapterConfig) {
        try {
            const webThingsClient = await WebThingsClient.local(adapterConfig.accessToken);
            webThingsClient.on("connectStateChanged", async (webThingId, connected) => {
                //this gets triggered for all things in the system, even those not added to the dashboard like Virtual things
                //so it is important to only update Azure with those in our dashboard
                //console.log(`****************************new Connected id=${webThingId} data: ${connected}`);
                if (connected) {
                    webthingDevicesList.add(webThingId);
                    try {
                        try {
                            var webThingDevice = await webThingsClient.getDevice(webThingId);
                            await AZIotHub.createIotHubDevice(webThingDevice);
                            webThingDevice.on('propertyChanged', (property, value) => {
                                const webThingDeviceId = AZIotHub.sanitizeNames(webThingDevice.id());
                                const AzIoTClient = AZIotHub.connectedDevicesList[webThingDeviceId];
                                //TODO:still not sure how to use the below, maybe pull the list from Azure registry
                                // and disconnect the disabled devices...
                                const secondsSinceLastDeviceCheck = (new Date().getTime() - AZIotHub.lastDeviceCheck.getTime()) / 1000;
                                if (secondsSinceLastDeviceCheck > (AZIotHub.adapterConfig.minCheckDeviceStatusInterval || 0)) {
                                    AZIotHub.lastDeviceCheck = new Date();
                                    console.log(`***********************Time since last device update: ${secondsSinceLastDeviceCheck}s`);
                                }
                                let deviceStatus = AZIotHub.devicesList[webThingDeviceId].status == 'enabled';
                                if (deviceStatus) {
                                    let batch = { [property.name]: value };
                                    AZIotHub.batchByDeviceId[webThingDeviceId] = batch;
                                    const batchJson = JSON.stringify(batch);
                                    const message = new Message(batchJson);
                                    AzIoTClient.sendEvent(message, function (err, res) {
                                        if (err) {
                                            //if the device is disabled we will receive this error DeviceNotFoundError
                                            console.log(`${webThingDeviceId} cannot send value = ${value} error: ${err}`);
                                            //try to recreate mnissing devices                                           
                                            AZIotHub.createIotHubDevice(webThingDevice);
                                        } else {
                                            console.log(`${webThingDeviceId} value = ${value} status = ${res.constructor.name}`);
                                        }
                                    });
                                }
                            });
                            webThingDevice.connect();
                        } catch (err) {
                            console.warn(`Could not connect to device ${webThingId} error:${err}`);
                        }
                    } catch (err) {
                        console.log(err);
                    }

                } else {
                    webthingDevicesList.delete(webThingId);
                }
            });
            //connect to the webthigns client events to monitor the changes in our things
            //give webthigns enough time to start and connect all things, this seems to take time when you have many
            //things on the dashboard, sometime it can take up to 15 seconds especially when used with virtual adapter addon
            //not sure if there is a method in webthings like isReady that is set when all things are added. if you know please let me know
            setTimeout(async () => {
                await webThingsClient.connect();
            }, 15000);
        } catch (err) {
            console.log(`error: ${err}`);
        }
    }
    async init_new(adapterConfig) {
        try {
            //let lastDeviceCheck = new Date();
            const webThingsClient = await WebThingsClient.local(adapterConfig.accessToken);

            webThingsClient.on("connectStateChanged", (webThingId, connected) => {

                //this gets triggered for all things in the system, even those not added to the dashboard like Virtual things
                //so it is important to only update Azure with those in out dashboard
                console.log(`****************************new Connected id=${webThingId} data: ${connected}`);
                if (connected) {
                    // var index = webthingDevicesList.indexOf(webThingId);
                    // console.log(index);
                    // if (index == -1) webthingDevicesList.push(webThingId);
                    webthingDevicesList.add(webThingId);
                    const webThingDeviceId = this.sanitizeNames(webThingId);
                    var IoTdevice = new AzureIoTHub.Device(null);
                    IoTdevice.deviceId = webThingDeviceId;
                    AZIotHub.registry.create(IoTdevice, AZIotHub.IoTHubcheckAndUpdate(IoTdevice, function next(myIoTdevice) {
                        // Connect to AzureIoTHub Get the newly-created or the existing device
                        AZIotHub.registry.get(myIoTdevice.deviceId, AZIotHub.IoTHubcheckAndUpdate(myIoTdevice, async function next(AzIoTdevice) {
                            console.log('\n**got device \'' + AzIoTdevice.deviceId + "=" + AzIoTdevice.authentication.symmetricKey.primaryKey + '\'');
                            console.log(`${AzIoTdevice.deviceId} is ${AzIoTdevice.status}`);
                            AZIotHub.devicesList[AzIoTdevice.deviceId] = AzIoTdevice;
                            const deviceConnectionString = `HostName=${AZIotHub.hubHostName};DeviceId=${AzIoTdevice.deviceId};SharedAccessKey=${AzIoTdevice.authentication.symmetricKey.primaryKey}`;
                            var AzIoTClient = AzureIoTDevice.Client.fromConnectionString(deviceConnectionString, Transport.Amqp);
                            try {
                                await AzIoTClient.open();
                                //save the Azure IoTHub device connection 
                                AZIotHub.connectedDevicesList[AzIoTdevice.deviceId] = AzIoTClient;

                                try {
                                    var webThingDevice = await webThingsClient.getDevice(webThingId);
                                    webThingDevice.on('propertyChanged', (property, value) => {
                                        const webThingDeviceId = AZIotHub.sanitizeNames(webThingDevice.id());
                                        let batch = { [property.name]: value };
                                        AZIotHub.batchByDeviceId[webThingDeviceId] = batch;
                                        const batchJson = JSON.stringify(batch);
                                        const message = new Message(batchJson);
                                        const AzIoTClient = AZIotHub.connectedDevicesList[webThingDeviceId];
                                        const secondsSinceLastDeviceCheck = (new Date().getTime() - AZIotHub.lastDeviceCheck.getTime()) / 1000;
                                        if (secondsSinceLastDeviceCheck > (adapterConfig.minCheckDeviceStatusInterval || 0)) {
                                            AZIotHub.lastDeviceCheck = new Date();
                                            console.log(`***********************Time since last device update: ${secondsSinceLastDeviceCheck}s`);
                                            //TODO:check IoT Hub for status change of the things by pulling a new list of the registry
                                            //deviceDisabled = yield this.checkDeviceStatus();
                                        }

                                        let deviceStatus = AZIotHub.devicesList[webThingDeviceId].status == 'enabled';
                                        //console.log(`${webThingDeviceId} = ${deviceStatus}`);
                                        if (deviceStatus) {
                                            //AzIoTClient.sendEvent(message, AZIotHub.printResultFor(`send: ${ webThingDeviceId }`));
                                            AzIoTClient.sendEvent(message, function (err, res) {
                                                if (err) {
                                                    //if the device is disabled we will receive this error DeviceNotFoundError
                                                    console.log(`${webThingDeviceId} cannot send value = ${value} error: ${err}`);
                                                } else {
                                                    console.log(`${webThingDeviceId} value = ${value} status = ${res.constructor.name}`);
                                                }
                                            });
                                        }
                                    });
                                    webThingDevice.connect();

                                } catch (e) {
                                    console.warn(`Could not connect to device ${webThingDeviceId}`);
                                }
                            }
                            catch (err) {
                                console.warn(`AzIoTClient Could not connect to device ${AzIoTdevice.deviceId}`);
                            }

                        }));
                    }));
                } else {
                    //console.log(`********remove ${webthingDevicesList.keys()}`);
                    // var index = webthingDevicesList.indexOf(webThingId);
                    // console.log(index);
                    // if (index > -1) webthingDevicesList.splice(index);
                    webthingDevicesList.delete(webThingId);
                }
            });
            //connect to the webthigns client events to monitor the changes in our things
            await webThingsClient.connect();
            console.log("webthingClient connected");

        } catch (err) {
            console.log(`error: ${err}`);
        }
    }
    async init_old(adapterConfig) {
        try {
            const webThingsClient = await WebThingsClient.local(adapterConfig.accessToken);

            webThingsClient.on("deviceAdded", (id, data) => {
                console.log(`****************************new thing added:  ${id}, data: ${data}`);
            });

            webThingsClient.on("deviceRemoved", (id, data) => {
                console.log(`****************************new thing added:  ${id}, data: ${data}`);
            });

            await webThingsClient.connect();
            console.log("webthingClient connected");

            //remove all existing event listeners
            for (const webThingDevice of webthingDevicesList) {
                console.log(`removing listener: ${webThingDevice.id()}`);
                webThingDevice.disconnect();

                //webThingDevice.removeAllListeners();

                // for (const event of webThingDevice.eventNames()) {
                //     //console.log(event);
                //     webThingDevice.removeAllListeners(event);
                // }
                // webThingDevice.removeAllListeners('propertyChanged', () => {
                //     console.log("off");
                // });
            }
            const webThingsDevices = await webThingsClient.getDevices();
            webthingDevicesList = webThingsDevices;
            //let lastDeviceCheck = new Date();
            for (const webThingDevice of webThingsDevices) {
                const webThingDeviceId = this.sanitizeNames(webThingDevice.id());
                var IoTdevice = new AzureIoTHub.Device(null);
                IoTdevice.deviceId = webThingDeviceId;
                AZIotHub.registry.create(IoTdevice, AZIotHub.IoTHubcheckAndUpdate('create', IoTdevice, function next(myIoTdevice) {
                    // Get the newly-created or the existing device
                    //console.log('\n**getting device \'' + myIoTdevice.deviceId + '\'');
                    AZIotHub.registry.get(myIoTdevice.deviceId, AZIotHub.IoTHubcheckAndUpdate('get', myIoTdevice, async function next(myIoTdevice2) {
                        console.log('\n**got device \'' + myIoTdevice2.deviceId + "=" + myIoTdevice2.authentication.symmetricKey.primaryKey + '\'');
                        console.log(`${myIoTdevice2.deviceId} is ${myIoTdevice2.status}`);

                        //if (myIoTdevice2.status == 'enabled') {
                        AZIotHub.devicesList[myIoTdevice2.deviceId] = myIoTdevice2;

                        const deviceConnectionString = `HostName=${AZIotHub.hubHostName};DeviceId=${myIoTdevice2.deviceId};SharedAccessKey=${myIoTdevice2.authentication.symmetricKey.primaryKey}`;
                        var AzIoTClient = AzureIoTDevice.Client.fromConnectionString(deviceConnectionString, Transport.Amqp);
                        try {
                            await AzIoTClient.open();
                            AZIotHub.connectedDevicesList[myIoTdevice2.deviceId] = AzIoTClient;
                            try {
                                // webThingDevice.removeAllListeners('propertyChanged', () => {
                                //     console.log("off");
                                // });

                                await webThingDevice.connect();

                                // webThingDevice.connect().then(() => {
                                //     console.log("finsihed");               
                                // }).catch(err => {
                                //     console.log(err);
                                // });
                                // setTimeout(async () => {
                                //     await webThingDevice.subscribeEvents(webThingDevice.events);
                                //     console.log(webThingDevice.id(), ':', 'Subscribed to all events');
                                // }, 100);
                                //give everything enough time to start and begin listening to events after 2 sec
                                //a bit ungly but hey it works....
                                setTimeout(async () => {
                                    webThingDevice.on('error', (error) => {
                                        console.log(webThingDevice.id(), ':', 'Something went wrong', error);
                                        webThingDevice.removeAllListeners();
                                    });
                                    webThingDevice.on('close', () => {
                                        console.log(webThingDevice.id(), ':', 'Connection closed');
                                        webThingDevice.removeAllListeners();
                                        // for (const webThingDevice of webthingDevicesList) {
                                        //     console.log(`before listener: ${webThingDevice.id()}`);
                                        // }
                                        //remove this thing from the list
                                        // delete webthingDevicesList[webthingDevicesList.indexOf(webThingDevice.id())];
                                        //var index = webthingDevicesList.indexOf(webThingDevice);

                                        //console.log(index);
                                        //if (index > -1) webthingDevicesList.splice(index);
                                        // for (const webThingDevice of webthingDevicesList) {
                                        //     console.log(`after listener: ${webThingDevice.id()}`);
                                        // }
                                        // webThingDevice.removeAllListeners();
                                        // AZIotHub.connectedDevicesList = {};
                                        // AZIotHub.batchByDeviceId = {};
                                        // AzIoTClient.close();
                                        //AZIotHub.init(adapterConfig);
                                    });
                                    webThingDevice.on('actionTriggered', (action, info) => {
                                        console.log(webThingDevice.id(), ':', `Action ${action.name} triggered with input ${JSON.stringify(info.input)}`);
                                    });
                                    webThingDevice.on('eventRaised', (event, info) => {
                                        console.log(webThingDevice.id(), ':', `Event ${event.name} raised: ${info.data}`);
                                    });
                                    webThingDevice.on('deviceModified', () => {
                                        console.log(webThingDevice.id(), ':', 'modified');
                                    });
                                    webThingDevice.on('connectStateChanged', (state) => {
                                        console.log(webThingDevice.id(), ':', state ? 'connected' : 'disconnected');
                                    });
                                    //this gets called everytime a property is changed this is where we would push to AzureIoTHub
                                    webThingDevice.on('propertyChanged', (property, value) => {
                                        //TODO: detect when the thing was removed from IoTHub and is no longer updatable 
                                        //so we need to recreate it all check if the things are disabled on IoTHub before updating
                                        const webThingDeviceId = AZIotHub.sanitizeNames(webThingDevice.id());
                                        //console.log(webThingDeviceId, ':', `Property ${property.name} changed to ${value}`);
                                        //let batch = myIotHub.batchByDeviceId[deviceId];
                                        let batch = { [property.name]: value };
                                        AZIotHub.batchByDeviceId[webThingDeviceId] = batch;
                                        const batchJson = JSON.stringify(batch);
                                        const message = new Message(batchJson);
                                        const AzIoTClient = AZIotHub.connectedDevicesList[webThingDeviceId];

                                        const secondsSinceLastDeviceCheck = (new Date().getTime() - AZIotHub.lastDeviceCheck.getTime()) / 1000;
                                        if (secondsSinceLastDeviceCheck > (adapterConfig.minCheckDeviceStatusInterval || 0)) {
                                            AZIotHub.lastDeviceCheck = new Date();
                                            console.log(`Time since last device update: ${secondsSinceLastDeviceCheck}s`);
                                            //TODO:check IoT Hub for status change of the things by pulling a new list of the registry
                                            //deviceDisabled = yield this.checkDeviceStatus();
                                        }
                                        let deviceStatus = AZIotHub.devicesList[webThingDeviceId].status == 'enabled';
                                        console.log(`${webThingDeviceId} = ${deviceStatus}`);
                                        if (deviceStatus) {
                                            //AzIoTClient.sendEvent(message, AZIotHub.printResultFor(`send: ${webThingDeviceId}`));
                                            AzIoTClient.sendEvent(message, function (err, res) {
                                                if (err) {
                                                    console.log(`${webThingDeviceId} cannot send value=${value} error: ${err}`);

                                                } else {
                                                    console.log(`${webThingDeviceId} value=${value} status=${res.constructor.name}`);
                                                }
                                            });
                                        }
                                    });
                                }, 1000);
                            } catch (e) {
                                console.warn(`Could not connect to device ${webThingDeviceId}`);
                            }
                        } catch (err) {
                            console.warn(`AzIoTClient Could not connect to device ${myIoTdevice2.deviceId}`);
                        }
                        //}
                        // Delete the new device
                        //registry.delete(device.deviceId, printAndContinue('delete'));
                    }));
                }));

                // try {
                //     var deviceInfo = await AZIotHub.registry.create(IoTdevice);
                //     IoTdevice = deviceInfo.responseBody;
                //     //console.log(deviceInfo.responseBody.deviceId);
                //     this.devicesList[deviceInfo.responseBody.deviceId] = deviceInfo.responseBody;
                // } catch (err) {
                //     if (err) console.log('error: ' + err.toString());
                //     if (err instanceof UnauthorizedError) console.log("unauthorized");
                //     try {
                //         //since the device already exists let's grab it from the registry
                //         var deviceInfo = await AZIotHub.registry.get(IoTdevice.deviceId);
                //         IoTdevice = deviceInfo.responseBody;
                //         //console.log(test.responseBody);
                //         //console.log(deviceInfo.responseBody.deviceId, originalDeviceId);
                //         this.devicesList[deviceInfo.responseBody.deviceId] = deviceInfo.responseBody;
                //     } catch (err) {
                //         console.log(err);
                //     }
                // }
            }

        } catch (err) {
            console.log(`error: ${err}`);
        }


        // await myIotHub.connectToIoTHub(adapterConfig);
        // //iterate throught the object list
        // for (const [key, value] of Object.entries(this.devicesList)) {
        //     console.log(`${key}: ${value.status}`);
        // }
        // //console.log(this.devicesList["example-plug"].authentication.symmetricKey.primaryKey);
    }

    //compare two objects and return only the difference
    //var _ = require('underscore');
    /* example
            let obj1 = { 104: 1, 102: 3, 101: 0 };
            let obj2 = { 104: 1, 102: 3 };
            let dif = comparetwoObject(obj1, obj2);
            console.log(`difference is: ${dif}`);
    */
    // comparetwoObject(obj1, obj2) {
    //     return _.difference(
    //         _.keys(obj1), // ["104", "102", "101"]
    //         _.keys(obj2) // ["104", "102"]
    //     )
    // }

    async connectToIoTHub(adapterConfig) {
        //load authorized webhings;
        const webThingsClient = await WebThingsClient.local(adapterConfig.accessToken);

        const devices = await webThingsClient.getDevices();

        for (const device of devices) {
            device.on('error', (error) => {
                console.log(device.id(), ':', 'Something went wrong', error);
            });
            device.on('close', () => {
                console.log(device.id(), ':', 'Connection closed');
            });
            device.on('actionTriggered', (action, info) => {
                console.log(device.id(), ':', `Action ${action.name} triggered with input ${JSON.stringify(info.input)}`);
            });
            device.on('eventRaised', (event, info) => {
                console.log(device.id(), ':', `Event ${event.name} raised: ${info.data}`);
            });
            device.on('connectStateChanged', (state) => {
                console.log(device.id(), ':', state ? 'connected' : 'disconnected');
            });
            device.on('deviceModified', () => {
                console.log(device.id(), ':', 'modified');
            });
            device.on('propertyChanged', (property, value) => {
                console.log(device.id(), ':', `Property ${property.name} changed to ${value}`);


            });


            const originalDeviceId = myIotHub.sanitizeNames(device.id());
            var IoTdevice = new AzureIoTHub.Device(null);
            IoTdevice.deviceId = originalDeviceId;
            try {
                var deviceInfo = await myIotHub.registry.create(IoTdevice);
                IoTdevice = deviceInfo.responseBody;
                //console.log(deviceInfo.responseBody.deviceId);
                this.devicesList[deviceInfo.responseBody.deviceId] = deviceInfo.responseBody;
            } catch (err) {
                if (err) console.log('error: ' + err.toString());
                if (err instanceof UnauthorizedError) console.log("unauthorized");
                try {
                    //since the device already exists let's grab it from the registry
                    var deviceInfo = await myIotHub.registry.get(IoTdevice.deviceId);
                    IoTdevice = deviceInfo.responseBody;
                    //console.log(test.responseBody);
                    //console.log(deviceInfo.responseBody.deviceId, originalDeviceId);
                    this.devicesList[deviceInfo.responseBody.deviceId] = deviceInfo.responseBody;
                } catch (err) {
                    console.log(err);
                }
            }



            const deviceConnectionString = `HostName=${myIotHub.hubHostName};DeviceId=${IoTdevice.deviceId};SharedAccessKey=${IoTdevice.authentication.symmetricKey.primaryKey}`;

            var client = AzureIoTDevice.Client.fromConnectionString(deviceConnectionString, Transport.Amqp);
            myIotHub.connectedDevices[originalDeviceId] = client;
            client.open(function (openErr) {
                console.log('device has opened.');
                if (openErr) {
                    console.error(openErr);
                } else {
                    console.log('about to connect a listener.');
                    client.on('message', function (msg) {
                        console.log('received a message');
                        //
                        // Make sure that the message we are looking at is one of the messages that we just sent.
                        //
                        // foundTheMessage = (msg.messageId === uuidData);
                        //
                        // It doesn't matter whether this was a message we want, complete it so that the message queue stays clean.
                        //
                        client.complete(msg, function (err, result) {
                            if (err) {
                                console.error(err);
                            } else {
                                //assert.equal(result.constructor.name, 'MessageCompleted');
                                if (foundTheMessage) {
                                    client.removeAllListeners('message');
                                    //testRendezvous.imDone(deviceClientParticipant);
                                }
                            }
                        });
                    });
                }
            });

            try {
                await device.connect();

                setTimeout(async () => {
                    await device.subscribeEvents(device.events);
                    console.log(device.id(), ':', 'Subscribed to all events');
                }, 100);
            } catch (e) {
                console.warn(`Could not connect to device ${device}`);
            }
        }





        /*
        
                const devices = await webThingsClient.getDevices();
                //var deviceByDeviceId = this.deviceByDeviceId;
                const registry = this.registry;
                for (const device of devices) {
        
                    const originalDeviceId = myIotHub.sanitizeNames(device.id());
                    await device.connect();
                    console.log(`Successfully connected to ${device.description.title} (${originalDeviceId})`);
        
                    var IoTdevice = new AzureIoTHub.Device(null);
                    IoTdevice.deviceId = originalDeviceId;
                    try {
                        var deviceInfo = await registry.create(IoTdevice);
                        IoTdevice = deviceInfo.responseBody;
                        //console.log(deviceInfo.responseBody.deviceId);
                        this.devicesList[deviceInfo.responseBody.deviceId] = deviceInfo.responseBody;
                    } catch (err) {
                        if (err) console.log('error: ' + err.toString());
                        if (err instanceof UnauthorizedError) console.log("unauthorized");
                        try {
                            //since the device already exists let's grab it from the registry
                            var deviceInfo = await registry.get(IoTdevice.deviceId);
                            IoTdevice = deviceInfo.responseBody;
                            //console.log(test.responseBody);
                            //console.log(deviceInfo.responseBody.deviceId, originalDeviceId);
                            this.devicesList[deviceInfo.responseBody.deviceId] = deviceInfo.responseBody;
                        } catch (err) {
                            console.log(err);
                        }
                    }
        
        
                    const deviceConnectionString = `HostName=${myIotHub.hubHostName};DeviceId=${IoTdevice.deviceId};SharedAccessKey=${IoTdevice.authentication.symmetricKey.primaryKey}`;
        
                    var client = AzureIoTDevice.Client.fromConnectionString(deviceConnectionString, Transport.Amqp);
                    myIotHub.connectedDevices[originalDeviceId] = client;
                    client.open(function (openErr) {
                        console.log('device has opened.');
                        if (openErr) {
                            console.error(openErr);
                        } else {
                            console.log('about to connect a listener.');
                            client.on('message', function (msg) {
                                console.log('received a message');
                                //
                                // Make sure that the message we are looking at is one of the messages that we just sent.
                                //
                                // foundTheMessage = (msg.messageId === uuidData);
                                //
                                // It doesn't matter whether this was a message we want, complete it so that the message queue stays clean.
                                //
                                client.complete(msg, function (err, result) {
                                    if (err) {
                                        console.error(err);
                                    } else {
                                        //assert.equal(result.constructor.name, 'MessageCompleted');
                                        if (foundTheMessage) {
                                            client.removeAllListeners('message');
                                            //testRendezvous.imDone(deviceClientParticipant);
                                        }
                                    }
                                });
                            });
                        }
                    });
        
                    device.on('propertyChanged', this.propertyChanged);
                    // return Promise.resolve();
                }
                */
    }


    propertyChanged(propName, propValue) {
        //make this function async
        (async () => {
            const { hubConnectionString, accessToken, updateTwin, minCheckDeviceStatusInterval } = myIotHub.adapterConfig;
            console.log('PropertyChanged: id:', propName.name,
                'name:', propName.name,
                'value:', propValue);
            const deviceId = myIotHub.sanitizeNames(this.id());
            const key = propName.name;
            let myDevice = myIotHub.devicesList[deviceId];
            console.log(`Updating ${key}=${propValue} in ${deviceId}`);

            const secondsSinceLastDeviceCheck =
                (new Date().getTime() - myIotHub.lastDeviceCheck.getTime()) / 1000;

            if (secondsSinceLastDeviceCheck > (minCheckDeviceStatusInterval || 0)) {
                myIotHub.lastDeviceCheck = new Date();
                console.log(`Time since last device update: ${secondsSinceLastDeviceCheck}s`);
                //check and update the device list to match status of IoTHub (enabled or disabled)
                // (async () => {
                //     let result = await myIotHub.checkDeviceStatus();
                //     console.log(result);
                //     console.log("over");
                // })();
                myDevice = await myIotHub.checkDeviceStatus();
                console.log(myDevice);
                console.log("over");
            }

            let batch = myIotHub.batchByDeviceId[deviceId];
            batch = { [key]: propValue };
            myIotHub.batchByDeviceId[deviceId] = batch;
            const batchJson = JSON.stringify(batch);
            const message = new Message(batchJson);

            // const windSpeed = 10 + (Math.random() * 4); // range: [10, 14]
            // const temperature = 20 + (Math.random() * 10); // range: [20, 30]
            // const humidity = 60 + (Math.random() * 20); // range: [60, 80]
            // const data = JSON.stringify({ deviceId: 'myFirstDevice', windSpeed: windSpeed, temperature: temperature, humidity: humidity });
            // const message = new Message(data);
            // message.properties.add('temperatureAlert', (temperature > 28) ? 'true' : 'false');

            myIotHub.connectedDevices[deviceId].sendEvent(message, myIotHub.printResultFor(`send: ${deviceId}`));
            //myIotHub.client.sendEvent(message, myIotHub.printResultFor('send'));


            // console.log(myDevice);
            // deviceClient = deviceSdk.Client.fromConnectionString(provisionedDevice.connectionString, deviceTransport);

            // const deviceConnectionString = `HostName=${myIotHub.hubHostName};DeviceId=${deviceId};SharedAccessKey=${myDevice.authentication.symmetricKey.primaryKey}`;

            //const client = AzureIoTDevice.Client.fromConnectionString(deviceConnectionString, Transport.Amqp);
            // try {
            //     await client.open();
            //     console.log(`Opened connection to device ${deviceId} `);
            // } catch (err) {
            //     console.log(err);
            // }

            // let client = AzureIoTDevice.Client.fromConnectionString(deviceConnectionString, Transport.Amqp);

            // client.on('connect', connectHandler);
            // client.on('error', errorHandler);
            // client.on('disconnect', disconnectHandler);
            // client.on('message', messageHandler);
            // client.on('connect', function (msg) {
            //     console.log('connect: ' + msg.messageId + ' Body: ' + msg.data);
            //     //client.complete(msg, printResultFor('completed'));
            // });
            // client.on('message', function (msg) {
            //     console.log('Id: ' + msg.messageId + ' Body: ' + msg.data);
            //     //client.complete(msg, printResultFor('completed'));
            // });
            // client.on('error', function (err) {
            //     console.error(err.message);
            // });

            // client.on('disconnect', function () {
            //     //clearInterval(sendInterval);
            //     client.removeAllListeners();
            //     //client.open(connectCallback);
            // });
            // client.open().catch(err => {
            //     console.error('Could not connect: ' + err.message);
            // });
            //this.devicesList[deviceId];
            /*
                        client.open(function (openErr) {
                            console.log('device has opened.');
                            if (openErr) {
                                console.error(openErr);
                            } else {
                                console.log('about to connect a listener.');
                                client.on('message', function (msg) {
                                    console.log('received a message');
                                    //
                                    // Make sure that the message we are looking at is one of the messages that we just sent.
                                    //
                                    // foundTheMessage = (msg.messageId === uuidData);
                                    //
                                    // It doesn't matter whether this was a message we want, complete it so that the message queue stays clean.
                                    //
                                    client.complete(msg, function (err, result) {
                                        if (err) {
                                            console.error(err);
                                        } else {
                                            //assert.equal(result.constructor.name, 'MessageCompleted');
                                            if (foundTheMessage) {
                                                client.removeAllListeners('message');
                                                //testRendezvous.imDone(deviceClientParticipant);
                                            }
                                        }
                                    });
                                });
                            }
                        });
            */
            console.log("move on");
        })();
    }

    printResultFor(op) {
        return function printResult(err, res) {
            if (err) {
                console.log(op + ' error: ' + err.toString());
            } else {
                console.log(op + ' status: ' + res.constructor.name);
            }
        };
    }

    updateDeviceStatus() {
        myIotHub.registry.list(function (err, deviceList) {
            if (err) {
                console.log(err);
                return null;
            } else {
                deviceList.forEach(function (device) {
                    var key = device.authentication ? device.authentication.symmetricKey.primaryKey : '<no primary key>';
                    console.log(device.deviceId + ': ' + key);
                });
            }
            return deviceList;
        });
    }

    async checkDeviceStatus() {
        const devices = (await this.registry.list()).responseBody;
        //TODO: handle if we have zero devices then we need to recreate them

        return new Promise(resolve => {
            //get the devices list from Azure IoTHub
            //loop through the list and update our devices with the current status
            for (const device of devices) {
                const { status } = device;
                console.log(`device: ${device.deviceId} before status=${this.devicesList[device.deviceId].status}`);
                //deviceDisabled[device.deviceId] = status !== 'enabled';
                this.devicesList[device.deviceId].status = status;
                console.log(`device: ${device.deviceId} after status=${this.devicesList[device.deviceId].status}`);
            }
            console.log("done checking");
            return resolve(devices);
        });
        // return __awaiter(this, void 0, void 0, function* () {
        //     const devices = (yield this.registry.list()).responseBody;
        //     const deviceDisabled = {};
        //     for (const device of devices) {
        //         const { status } = device;
        //         deviceDisabled[device.deviceId] = status !== 'enabled';
        //     }
        //     return deviceDisabled;
        // });
    }

    provisionIoTDevices() {


    }
    deleteIoTDevice(device, callback) {
        //var registry = AzureIoTHub.Registry.fromConnectionString(hubConnectionString);
        var registry = this.registry;
        registry.delete(device.deviceId, function (delErr) {
            if (delErr) {
                done(delErr);
            } else {
                this.registry.get(device.deviceId, function (getErr) {
                    assert.instanceOf(getErr, errors.DeviceNotFoundError);
                    done();
                });
            }
        });
    }

    provisionIoTDevice(deviceId, callback) {
        //var registry = AzureIoTHub.Registry.fromConnectionString(iotHubConnectionString);
        var registry = this.registry;
        var device = new AzureIoTHub.Device(null);
        device.deviceId = deviceId;

        //registry.create(device, callback);
        registry.create(device, function (createErr, createResult) {
            if (createErr) {
                console.log(createErr);
                done(err, deviceInfo, res)
            } else {
                registry.get(device.deviceId, function (getErr, getResult) {
                    if (getErr) {
                        console.log(getErr);
                    } else {
                        console.log(getResult.deviceId, device.deviceId);
                        done(null, deviceInfo, res)
                    }
                });
            }
        });
    }

    sanitizeNames(s) {
        return s
            .split('')
            .map((x) => x.replace(/[^a-zA-Z0-9-.+%_#*?!(),:=@$']/, '_'))
            .join('');
    }
    onConnect(connection) {
        console.log(`onConnect: ${connection}`);
    }
    onError(error) {
        console.log(`onError: ${error}`);
    }
    onClose() {
        console.log(`onClose`);
    }
    onPong() {
        console.log(`onPong`);
    }
    onDeviceModified(data) {
        console.log(`onDeviceModified: ${data}`);
    }
    onConnectStateChanged(data) {
        console.log(`onConnectStateChanged: ${data}`);
    }
    onEventRaised(event, data) {
        console.log(`onEventRaised: event:${event} abnd data: ${data}`);
    }
    onActionTriggered(action, data) {
        console.log(`onActionTriggered: event:${action} abnd data: ${data}`);
    }


    printAndContinue(op, next) {
        return function printResult(err, deviceInfo, res) {
            if (err) console.log(op + ' error: ' + err.toString());
            if (res) console.log(op + ' status: ' + res.statusCode + ' ' + res.statusMessage);
            if (deviceInfo) console.log(op + ' device info: ' + JSON.stringify(deviceInfo));
            if (next) next();
        };
    }

    setupIoTDevice(device, provisionDescription, done) {
        registry.create(device, function (err) {
            if (err) {
                debug('Failed to create device identity: ' + device.deviceId + ' : ' + err.toString());
                done(err);
            } else {
                debug('Device created: ' + device.deviceId);
                done(null, provisionDescription);
            }
        });
    }

    createIoTDevice(deviceDescription) {
        // Create a new device // + Date.now()
        // var device = {
        //     deviceId: 'sample-device-jay'
        // };
        let registry = this.registry;
        let printAndContinue = this.printAndContinue;
        console.log('\n**creating device \'' + deviceDescription.deviceId + '\'');
        //Read the trhottling rate, https://docs.microsoft.com/en-us/azure/iot-hub/iot-hub-devguide-quotas-throttling
        // registry.create(deviceDescription, printAndContinue('create', function next() {

        //     // Get the newly-created device
        //     console.log('\n**getting device \'' + device.deviceId + '\'');
        //     registry.get(deviceDescription.deviceId, printAndContinue('get', function next() {

        //         // Delete the new device
        //         console.log('\n**deleting device \'' + deviceDescription.deviceId + '\'');
        //         //this.registry.delete(device.deviceId, printAndContinue('delete'));
        //     }));
        // }));
        deviceDescription.deviceId = "sample-device";
        registry.create(deviceDescription, function (err, deviceInfo, res) {
            if (err) {
                if (err) console.log(' error: ' + err.toString());
                if (err instanceof UnauthorizedError) console.log("jay= unauthorized");
                registry.get(deviceDescription.deviceId, myIotHub.printDeviceInfo);
            } else {
                //console.log(' status: ' + res.statusCode + ' ' + res.statusMessage);
                if (deviceInfo) {
                    myIotHub.printDeviceInfo(err, deviceInfo, res);
                    console.log(' device info: ' + JSON.stringify(deviceInfo));
                    //testDeviceKey = createdDevice.authentication.symmetricKey.primaryKey;
                    console.log('Device ID: ' + deviceInfo.deviceId);
                    console.log('Device key: ' + deviceInfo.authentication.symmetricKey.primaryKey);
                }

            }
        });
    }
    printDeviceInfo(err, deviceInfo, res) {
        if (deviceInfo) {
            console.log('Device ID: ' + deviceInfo.deviceId);
            var key = deviceInfo.authentication ? deviceInfo.authentication.symmetricKey.primaryKey : '<no primary key>';
            console.log('Device key: ' + key);
            console.log('Device key: ' + deviceInfo.authentication.symmetricKey.primaryKey);

        }
    }

    // let client = AzureIoTDevice.Client.fromConnectionString(hubConnectionString, Protocol);

    // client.on('connect', connectHandler);
    // client.on('error', errorHandler);
    // client.on('disconnect', disconnectHandler);
    // client.on('message', messageHandler);

    // client.open()
    //     .catch(err => {
    //         console.error('Could not connect: ' + err.message);
    //     });

    connectToGateway(adapterConfig) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log("**********************ConectToGateway************************");
            console.log(adapterConfig);
            const { accessToken, updateTwin, minCheckDeviceStatusInterval } = adapterConfig;
            let deviceDisabled = yield this.checkDeviceStatus();
            let lastDeviceCheck = new Date();
            const webThingsClient = yield WebThingsClient.local(accessToken);
            const devices = yield webThingsClient.getDevices();
            for (const device of devices) {
                const originalDeviceId = device.id();
                yield device.connect();
                // eslint-disable-next-line max-len
                console.log(`Successfully connected to ${device.description.title} (${originalDeviceId})`);
                device.on('propertyChanged', (property, value) => __awaiter(this, void 0, void 0, function* () {
                    const key = property.name;
                    const secondsSinceLastDeviceCheck = (new Date().getTime() - lastDeviceCheck.getTime()) / 1000;
                    if (secondsSinceLastDeviceCheck > (minCheckDeviceStatusInterval || 0)) {
                        lastDeviceCheck = new Date();
                        console.log(`Time since last device update: ${secondsSinceLastDeviceCheck} s`);
                        deviceDisabled = yield this.checkDeviceStatus();
                    }
                    const deviceId = sanitizeNames(originalDeviceId);
                    console.log(`Updating ${key}=${value} in ${deviceId} `);
                    if (deviceDisabled[deviceId]) {
                        console.log(`Device ${deviceId} is not enabled, ignoring update`);
                        return;
                    }
                    let batch = this.batchByDeviceId[deviceId];
                    if (!batch) {
                        console.log(`Creating batch for ${deviceId}`);
                        batch = { [key]: value };
                        this.batchByDeviceId[deviceId] = batch;
                        try {
                            const device = yield this.getOrCreateDevice(deviceId);
                            const batchJson = JSON.stringify(batch);
                            try {
                                console.log(`Sending event ${batchJson} to ${deviceId} `);
                                const message = new AzureIoTDevice.Message(batchJson);
                                yield device.sendEvent(message);
                                console.log(`Sent event ${batchJson} to ${deviceId} `);
                            }
                            catch (e) {
                                console.log(`Could not send event to ${deviceId}: ${e} `);
                            }
                            if (updateTwin) {
                                try {
                                    console.log(`Applying ${batchJson} to twin ${deviceId} `);
                                    yield this.updateTwin(deviceId, device, batch);
                                    console.log(`Updated twin of ${deviceId} with ${batchJson} `);
                                }
                                catch (e) {
                                    console.log(`Could not update twin of ${deviceId}: ${e} `);
                                }
                            }
                        }
                        catch (e) {
                            console.log(`Could not create device for ${deviceId}: ${e} `);
                        }
                        delete this.batchByDeviceId[deviceId];
                    }
                    else {
                        console.log(`Adding ${key}=${value} in ${deviceId} to batch`);
                        batch[key] = value;
                    }
                }));
            }
        });
    }

    updateTwin(deviceId, device, batch) {
        return __awaiter(this, void 0, void 0, function* () {
            const twin = yield this.getOrCreateTwin(deviceId, device);
            return new Promise((resolve, reject) => {
                twin.properties.reported.update(batch, (error) => {
                    if (error) {
                        reject(error);
                    }
                    else {
                        resolve();
                    }
                });
            });
        });
    }
    getOrCreateTwin(deviceId, device) {
        return __awaiter(this, void 0, void 0, function* () {
            let twin = this.twinByDeviceId[deviceId];
            if (!twin) {
                twin = yield device.getTwin();
                this.twinByDeviceId[deviceId] = twin;
            }
            return twin;
        });
    }
    getOrCreateDevice(deviceId) {
        return __awaiter(this, void 0, void 0, function* () {
            let device = this.deviceByDeviceId[deviceId];
            if (!device) {
                let accessKey = yield this.getOrCreateDeviceKey(deviceId);
                try {
                    device = yield this.createDeviceClient(deviceId, accessKey);
                }
                catch (error) {
                    console.log(`Could not create device: ${error} `);
                    console.log(`Attempting to recreate device for ${deviceId}`);
                    accessKey = yield this.createDeviceKey(deviceId);
                    yield this.savePrimaryKey(deviceId, accessKey);
                    device = yield this.createDeviceClient(deviceId, accessKey);
                }
                this.deviceByDeviceId[deviceId] = device;
            }
            return device;
        });
    }
    getOrCreateDeviceKey(deviceId) {
        return __awaiter(this, void 0, void 0, function* () {
            let accessKey = yield this.loadPrimaryKey(deviceId);
            if (!accessKey) {
                accessKey = yield this.createDeviceKey(deviceId);
                yield this.savePrimaryKey(deviceId, accessKey);
            }
            return accessKey;
        });
    }
    loadPrimaryKey(deviceId) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log(`Loading primary key for ${deviceId}`);
            yield this.database.open();
            const config = yield this.database.loadConfig();
            if (config.devices && config.devices[deviceId]) {
                return config.devices[deviceId].primaryKey;
            }
            return null;
        });
    }
    createDeviceKey(deviceId) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log(`Creating device for ${deviceId}`);
            const primaryKey = Buffer.from(uuidv4()).toString('base64');
            const secondaryKey = Buffer.from(uuidv4()).toString('base64');
            yield this.registry.addDevices([
                {
                    deviceId,
                    status: 'enabled',
                    authentication: {
                        symmetricKey: {
                            primaryKey,
                            secondaryKey,
                        },
                    },
                },
            ]);
            return primaryKey;
        });
    }
    savePrimaryKey(deviceId, primaryKey) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log(`Saving primary key for ${deviceId}`);
            yield this.database.open();
            const config = yield this.database.loadConfig();
            config.devices = config.devices || {};
            config.devices[deviceId] = {
                primaryKey,
            };
            yield this.database.saveConfig(config);
        });
    }
    createDeviceClient(deviceId, accessKey) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log(`Creating device client for ${deviceId}`);
            // eslint-disable-next-line max-len
            const deviceConnectionString = `HostName = ${this.hubHostName}; DeviceId = ${deviceId}; SharedAccessKey = ${accessKey} `;
            const client = AzureIoTDevice.Client.fromConnectionString(deviceConnectionString, Amqp);
            yield client.open();
            console.log(`Opened connection to device ${deviceId} `);
            return client;
        });
    }
}

// function loadRunProgramAdapter(addonManager) {
//     const db = new Database(manifest.id);
//     db.open().then(() => {
//         return db.loadConfig();
//     }).then((config) => {
//         new FotAzureIoTHubAdapter(addonManager, config);
//     });
// }
//module.exports = loadRunProgramAdapter;
module.exports = FotAzureIoTHubAdapter;